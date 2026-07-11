// ritmo/js/views/stepTree.js
// Árbol recursivo de pasos/subtareas, reutilizado por Tareas (subtareas) y
// Proyectos (pasos y subpasos, a cuantos niveles haga falta). Muta el array
// `steps` que se le pasa directamente (por referencia) y avisa con onMutate
// para que quien lo use guarde y actualice el % de progreso si corresponde.

import { el } from '../ui.js';
import { newStep } from '../store.js';

function swap(arr, i, j) { [arr[i], arr[j]] = [arr[j], arr[i]]; }

export function renderStepTree(steps, { onMutate, showDates = false }) {
  const root = el('div', { class: 'step-tree' });

  function rebuild() {
    root.innerHTML = '';
    root.appendChild(renderLevel(steps));
  }

  function renderLevel(levelSteps) {
    const ul = el('div', { class: 'step-tree' });
    for (const step of levelSteps) {
      ul.appendChild(renderStepNode(step, levelSteps));
    }
    const addBtn = el('button', {
      class: 'step-add-child', onClick: () => {
        levelSteps.push(newStep('Nuevo paso'));
        mutate();
      },
    }, '+ agregar paso');
    ul.appendChild(addBtn);
    return ul;
  }

  function renderStepNode(step, parentArray) {
    const wrap = el('div');
    const row = el('div', { class: 'step-row' });

    const check = el('div', { class: 'step-check' + (step.completed ? ' done' : '') });
    check.innerHTML = step.completed ? '✓' : '';
    check.style.fontSize = '11px';
    check.style.color = '#fff';
    check.addEventListener('click', () => {
      step.completed = !step.completed;
      step.completedAt = step.completed ? new Date().toISOString() : null;
      if (step.children && step.children.length) {
        walk(step.children, s => { s.completed = step.completed; s.completedAt = step.completed ? new Date().toISOString() : null; });
      }
      mutate();
    });
    row.appendChild(check);

    const titleInput = el('input', { type: 'text', value: step.title, class: 'step-title' + (step.completed ? ' done' : '') });
    titleInput.addEventListener('focus', () => { if (titleInput.value === 'Nuevo paso' || titleInput.value === 'Nuevo subpaso') titleInput.select(); });
    titleInput.addEventListener('change', () => { step.title = titleInput.value; onMutate(); });
    row.appendChild(titleInput);

    const idx = parentArray.indexOf(step);
    const btns = el('div', { class: 'step-btns' });

    if (showDates) {
      const hasDate = !!step.dueDate;
      const calBtn = el('button', {
        class: 'step-move', type: 'button',
        title: hasDate ? `Fecha: ${step.dueDate}` : 'Agregar fecha',
        style: hasDate ? 'color:var(--teal);font-size:12px;' : 'font-size:13px;',
      }, hasDate ? `📅 ${step.dueDate.slice(5)}` : '📅');
      calBtn.addEventListener('click', () => {
        const dp = el('input', { type: 'date', value: step.dueDate || '', style: 'position:absolute;opacity:0;pointer-events:none;' });
        calBtn.after(dp);
        dp.addEventListener('change', () => { step.dueDate = dp.value || null; onMutate(); mutate(); });
        dp.addEventListener('blur', () => dp.remove());
        dp.focus(); dp.showPicker?.();
      });
      btns.appendChild(calBtn);
      if (hasDate) {
        btns.appendChild(el('button', { class: 'step-remove', type: 'button', title: 'Quitar fecha', onClick: () => { step.dueDate = null; mutate(); } }, '×'));
      }
    }

    if (idx > 0) {
      btns.appendChild(el('button', { class: 'step-move', title: 'Subir', onClick: () => { swap(parentArray, idx, idx - 1); mutate(); } }, '↑'));
    }
    if (idx < parentArray.length - 1) {
      btns.appendChild(el('button', { class: 'step-move', title: 'Bajar', onClick: () => { swap(parentArray, idx, idx + 1); mutate(); } }, '↓'));
    }
    btns.appendChild(el('button', {
      class: 'step-add-child', title: 'Agregar subpaso',
      onClick: () => { step.children = step.children || []; step.children.push(newStep('Nuevo subpaso')); mutate(); },
    }, '+'));
    btns.appendChild(el('button', {
      class: 'step-remove', title: 'Eliminar',
      onClick: () => {
        const i = parentArray.indexOf(step);
        if (i >= 0) parentArray.splice(i, 1);
        mutate();
      },
    }, '✕'));
    row.appendChild(btns);

    wrap.appendChild(row);

    if (step.children && step.children.length) {
      const childWrap = el('div', { class: 'step-children' }, renderLevel(step.children));
      wrap.appendChild(childWrap);
    }
    return wrap;
  }

  function walk(list, fn) {
    for (const s of list) { fn(s); if (s.children?.length) walk(s.children, fn); }
  }

  function mutate() {
    onMutate();
    rebuild();
  }

  rebuild();
  return root;
}
