// ritmo/js/views/stepTree.js
// Árbol recursivo de pasos/subtareas, reutilizado por Tareas (subtareas) y
// Proyectos (pasos y subpasos, a cuantos niveles haga falta). Muta el array
// `steps` que se le pasa directamente (por referencia) y avisa con onMutate
// para que quien lo use guarde y actualice el % de progreso si corresponde.

import { el } from '../ui.js';
import { uid, newStep } from '../store.js';

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
    titleInput.addEventListener('change', () => { step.title = titleInput.value; onMutate(); });
    row.appendChild(titleInput);

    if (showDates) {
      const dateInput = el('input', { type: 'date', value: step.dueDate || '', style: 'width:128px;padding:6px 8px;font-size:12.5px;flex:0 0 auto;' });
      dateInput.addEventListener('change', () => { step.dueDate = dateInput.value || null; onMutate(); });
      row.appendChild(dateInput);
    }

    const addChild = el('button', {
      class: 'step-add-child', title: 'Agregar subpaso',
      onClick: () => { step.children = step.children || []; step.children.push(newStep('Nuevo subpaso')); mutate(); },
    }, '+');
    row.appendChild(addChild);

    const removeBtn = el('button', {
      class: 'step-remove', title: 'Eliminar',
      onClick: () => {
        const idx = parentArray.indexOf(step);
        if (idx >= 0) parentArray.splice(idx, 1);
        mutate();
      },
    }, '✕');
    row.appendChild(removeBtn);

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
