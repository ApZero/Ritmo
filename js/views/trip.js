// ritmo/js/views/trip.js
// Planificador de salida: lista ordenable de tareas para una salida al centro.
// El viaje se cierra solo cuando todo está marcado, o manualmente.
// Las tareas sin marcar simplemente quedan como tareas normales.

import { el, openSheet, closeSheet, toast, escapeHtml } from '../ui.js';
import * as Store from '../store.js';
import * as R from '../recurrence.js';
import { todayISO, formatDateEs } from '../ui.js';
import { openTaskFormExternal } from './tasks.js';

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
  const today = R.toDateOnly(todayISO());
  const settings = Store.getSettings();

  // Recolectar tareas disponibles (vencidas + hoy + próximas + sin fecha)
  const allTasks = Store.listTasks().filter(t => !t.archived && !(t.type === 'once' && t.completed));
  const allSteps = Store.listAllStepsWithDates({ includeCompleted: false });

  const candidates = [];
  for (const t of allTasks) {
    const due = t.type === 'once' ? t.dueDate : t.currentDueDate;
    const status = due ? R.classifyStatus(R.toDateOnly(due), today, settings.proximoWindowDays) : 'sin_fecha';
    candidates.push({ id: 'task:' + t.id, taskId: t.id, title: t.title, status, due });
  }
  for (const { project, step } of allSteps) {
    const status = R.classifyStatus(R.toDateOnly(step.dueDate), today, settings.proximoWindowDays);
    candidates.push({ id: 'step:' + step.id, stepId: step.id, projectTitle: project.title, title: `${step.title} (${project.title})`, status, due: step.dueDate });
  }
  candidates.sort((a, b) => {
    const order = { vencido: 0, hoy: 1, proximo: 2, a_tiempo: 3, sin_fecha: 4 };
    return (order[a.status] ?? 5) - (order[b.status] ?? 5);
  });

  const selected = new Set(); // ids
  const wrap = el('div');

  wrap.appendChild(el('p', { style: 'font-size:12.5px;color:var(--ink-soft);margin:0 0 12px;' },
    'Elegí las tareas que vas a hacer en esta salida. Podés reordenarlas después.'));

  const list = el('div', { style: 'display:flex;flex-direction:column;gap:6px;margin-bottom:14px;' });
  for (const c of candidates) {
    const row = el('div', { style: 'display:flex;align-items:center;gap:10px;padding:8px 10px;background:var(--surface);border:1px solid var(--line);border-radius:10px;cursor:pointer;' });
    const chk = el('div', { style: 'width:20px;height:20px;border-radius:5px;border:2px solid var(--line);flex:0 0 auto;display:flex;align-items:center;justify-content:center;font-size:12px;' });
    const lbl = el('div', { style: 'flex:1;min-width:0;' }, [
      el('div', { style: 'font-size:13.5px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;' }, c.title),
      c.due ? el('div', { style: 'font-size:11px;color:var(--ink-soft);' }, formatDateEs(c.due)) : null,
    ]);
    row.appendChild(chk);
    row.appendChild(lbl);
    row.addEventListener('click', () => {
      if (selected.has(c.id)) {
        selected.delete(c.id);
        chk.textContent = '';
        chk.style.background = '';
        chk.style.borderColor = 'var(--line)';
        row.style.borderColor = 'var(--line)';
      } else {
        selected.add(c.id);
        chk.textContent = '✓';
        chk.style.color = '#fff';
        chk.style.background = 'var(--teal)';
        chk.style.borderColor = 'var(--teal)';
        row.style.borderColor = 'var(--teal)';
      }
    });
    list.appendChild(row);
  }

  // Manual add
  const addNewRow = el('div', { style: 'display:flex;gap:8px;margin-top:6px;' });
  const newInput = el('input', { type: 'text', placeholder: 'Agregar tarea específica para esta salida…', style: 'flex:1;' });
  const addBtn = el('button', { class: 'btn btn-secondary', style: 'width:auto;padding:10px 14px;' }, '+');
  addBtn.addEventListener('click', () => {
    const title = newInput.value.trim();
    if (!title) return;
    const id = 'new:' + Date.now();
    const task = Store.createTask({ title, type: 'once', dueDate: todayISO() });
    selected.add('task:' + task.id);
    // Add a visual row for it
    const newRow = el('div', { style: 'display:flex;align-items:center;gap:10px;padding:8px 10px;background:var(--teal-soft);border:1.5px solid var(--teal);border-radius:10px;' }, [
      el('div', { style: 'width:20px;height:20px;border-radius:5px;background:var(--teal);display:flex;align-items:center;justify-content:center;font-size:12px;color:#fff;' }, '✓'),
      el('div', { style: 'font-size:13.5px;font-weight:500;' }, title),
    ]);
    list.insertBefore(newRow, list.lastChild?.nextSibling || null);
    selected.add('task:' + task.id);
    // Update the candidate to track it
    candidates.push({ id: 'task:' + task.id, taskId: task.id, title, status: 'hoy' });
    newInput.value = '';
    toast('Tarea creada y agregada al viaje');
  });
  addNewRow.appendChild(newInput);
  addNewRow.appendChild(addBtn);

  const startBtn = el('button', { class: 'btn btn-primary', style: 'margin-top:14px;' }, '🚗 Iniciar salida');
  startBtn.addEventListener('click', () => {
    if (!selected.size) { toast('Elegí al menos una tarea.'); return; }
    const items = candidates
      .filter(c => selected.has(c.id))
      .map(c => ({ taskId: c.taskId || null, title: c.title, done: false }));
    Store.startTrip(items);
    closeSheet();
    onRefreshHoy();
    // Immediately open the active trip sheet
    setTimeout(() => openActiveTripSheet(onRefreshHoy), 80);
  });

  wrap.appendChild(list);
  wrap.appendChild(addNewRow);
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
        Store.setTripItemDone(item.id, !item.done);
        const updatedTrip = Store.getTrip();
        // Check if all done → auto-end
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
    });

    const addPanel = el('div', { style: 'display:none;margin-top:10px;' });

    // Quick-add: type title and add directly
    const quickRow = el('div', { style: 'display:flex;gap:8px;margin-bottom:10px;' });
    const quickInput = el('input', { type: 'text', placeholder: 'Nueva tarea rápida…', style: 'flex:1;' });
    const quickBtn = el('button', { class: 'btn btn-primary', style: 'width:auto;padding:10px 14px;' }, '+');
    quickBtn.addEventListener('click', () => {
      const title = quickInput.value.trim();
      if (!title) return;
      const task = Store.createTask({ title, type: 'once', dueDate: todayISO() });
      const current = Store.getTrip();
      Store.updateTripItems([...current.items, { id: Store.uid(), taskId: task.id, title, done: false }]);
      quickInput.value = '';
      toast(`"${title}" agregada`);
      rebuild();
    });
    quickRow.appendChild(quickInput);
    quickRow.appendChild(quickBtn);
    addPanel.appendChild(quickRow);

    // Pick from existing tasks not already in this trip
    const currentTrip = Store.getTrip();
    const alreadyIn = new Set((currentTrip?.items || []).map(i => i.taskId).filter(Boolean));
    const available = Store.listTasks()
      .filter(t => !t.archived && !(t.type === 'once' && t.completed) && !alreadyIn.has(t.id));

    if (available.length) {
      addPanel.appendChild(el('div', { style: 'font-size:11.5px;color:var(--ink-soft);margin-bottom:6px;' }, 'O elegí de tus tareas:'));
      const pickList = el('div', { style: 'display:flex;flex-direction:column;gap:5px;max-height:200px;overflow-y:auto;' });
      for (const t of available) {
        const row = el('div', { style: 'display:flex;align-items:center;gap:10px;padding:8px 10px;background:var(--surface);border:1px solid var(--line);border-radius:9px;cursor:pointer;' });
        row.appendChild(el('div', { style: 'flex:1;font-size:13.5px;' }, t.title));
        const addTaskBtn = el('button', { class: 'btn btn-secondary', style: 'width:auto;padding:5px 10px;font-size:12px;' }, 'Agregar');
        addTaskBtn.addEventListener('click', () => {
          const cur = Store.getTrip();
          Store.updateTripItems([...cur.items, { id: Store.uid(), taskId: t.id, title: t.title, done: false }]);
          row.style.opacity = '0.4';
          row.style.pointerEvents = 'none';
          addTaskBtn.textContent = '✓';
          toast(`"${t.title}" agregada`);
          onRefreshHoy();
          // Partial rebuild — just update count and progress without closing
          const newTrip = Store.getTrip();
          const d = newTrip.items.filter(i => i.done).length;
          const tot = newTrip.items.length;
          progressLabel.textContent = `${d}/${tot} completadas`;
          progressFill.style.width = `${Math.round(d / tot * 100)}%`;
        });
        row.appendChild(addTaskBtn);
        pickList.appendChild(row);
      }
      addPanel.appendChild(pickList);
    } else {
      addPanel.appendChild(el('div', { style: 'font-size:12px;color:var(--ink-soft);' }, 'No quedan tareas para agregar.'));
    }

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
