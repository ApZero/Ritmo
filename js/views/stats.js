// ritmo/js/views/stats.js
import { el, formatMinutes } from '../ui.js';
import * as Store from '../store.js';
import * as R from '../recurrence.js';

export const fab = null;

function daysDiff(a, b) { return R.toDateOnly(b).getTime() - R.toDateOnly(a).getTime(); }

function taskStats(t) {
  const hist = t.history || [];
  if (!hist.length) return { count: 0, onTimeRate: null, streak: 0, avgLatenessDays: 0 };
  let onTime = 0, latenessSum = 0;
  let streak = 0; let streakBroken = false;
  for (let i = hist.length - 1; i >= 0; i--) {
    const h = hist[i];
    const late = h.dueDate && h.completedAt.slice(0, 10) > h.dueDate;
    if (!late) onTime++; else latenessSum += Math.round(daysDiff(h.dueDate, h.completedAt.slice(0, 10)) / 86400000);
    if (!streakBroken) { if (!late) streak++; else streakBroken = true; }
  }
  return {
    count: hist.length,
    onTimeRate: Math.round((onTime / hist.length) * 100),
    streak,
    avgLatenessDays: hist.length ? Math.round((latenessSum / hist.length) * 10) / 10 : 0,
  };
}

export function render(container) {
  const tasks = Store.listTasks().filter(t => !t.archived);
  const recurring = tasks.filter(t => t.type !== 'once');
  const once = tasks.filter(t => t.type === 'once');
  const projects = Store.listProjects().filter(p => !p.archived);

  const totalCompletions = recurring.reduce((s, t) => s + (t.history || []).length, 0);
  const totalOnTime = recurring.reduce((s, t) => s + (t.history || []).filter(h => !(h.dueDate && h.completedAt.slice(0, 10) > h.dueDate)).length, 0);
  const overallRate = totalCompletions ? Math.round((totalOnTime / totalCompletions) * 100) : null;
  const bestStreak = recurring.reduce((max, t) => Math.max(max, taskStats(t).streak), 0);
  const onceDone = once.filter(t => t.completed).length;

  container.appendChild(el('div', { class: 'stat-grid' }, [
    statBox(recurring.length, 'Tareas recurrentes'),
    statBox(overallRate !== null ? `${overallRate}%` : '—', 'Cumplimiento a tiempo'),
    statBox(bestStreak, 'Mejor racha (veces seguidas)'),
    statBox(`${onceDone}/${once.length}`, 'Tareas sueltas hechas'),
  ]));

  // Por categoría
  container.appendChild(el('div', { class: 'section-label' }, 'Por categoría (últimos 30 días)'));
  const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 30);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  const byCat = {};
  for (const t of tasks) {
    const key = t.categoryId || '__none__';
    byCat[key] = byCat[key] || { count: 0, minutes: 0 };
    const completions = t.type === 'once'
      ? (t.completed && t.completedAt && t.completedAt.slice(0, 10) >= cutoffStr ? 1 : 0)
      : (t.history || []).filter(h => h.completedAt && h.completedAt.slice(0, 10) >= cutoffStr).length;
    byCat[key].count += completions;
    byCat[key].minutes += completions * (t.estimatedMinutes || 0);
  }
  const catList = el('div', { class: 'list' });
  const cats = Store.listCategories();
  const entries = Object.entries(byCat).filter(([, v]) => v.count > 0).sort((a, b) => b[1].count - a[1].count);
  if (!entries.length) {
    catList.appendChild(el('div', { class: 'empty-state' }, 'Todavía no hay finalizaciones en los últimos 30 días.'));
  }
  for (const [catId, v] of entries) {
    const cat = catId !== '__none__' ? cats.find(c => c.id === catId) : null;
    catList.appendChild(el('div', { class: 'card' }, el('div', { class: 'card-row', style: 'justify-content:space-between;align-items:center;' }, [
      el('div', {}, cat ? `${cat.icon || ''} ${cat.name}` : 'Sin categoría'),
      el('div', { class: 'mono', style: 'font-size:13px;color:var(--ink-soft);' }, `${v.count}× · ${formatMinutes(v.minutes)}`),
    ])));
  }
  container.appendChild(catList);

  // Consistencia por tarea
  if (recurring.length) {
    container.appendChild(el('div', { class: 'section-label' }, 'Consistencia por tarea'));
    const tlist = el('div', { class: 'list' });
    recurring
      .map(t => ({ t, s: taskStats(t) }))
      .filter(({ s }) => s.count > 0)
      .sort((a, b) => b.s.count - a.s.count)
      .forEach(({ t, s }) => {
        tlist.appendChild(el('div', { class: 'card' }, [
          el('div', { class: 'card-row', style: 'justify-content:space-between;align-items:baseline;' }, [
            el('div', { class: 'card-title', style: 'font-size:14px;' }, t.title),
            el('div', { class: 'mono', style: 'font-size:12.5px;color:var(--olive);' }, `${s.onTimeRate}% a tiempo`),
          ]),
          el('div', { style: 'font-size:12px;color:var(--ink-soft);margin-top:3px;' },
            `${s.count} veces · racha actual: ${s.streak}` + (s.avgLatenessDays > 0 ? ` · demora prom.: ${s.avgLatenessDays} días` : '')),
        ]));
      });
    container.appendChild(tlist);
  }

  // Proyectos
  if (projects.length) {
    container.appendChild(el('div', { class: 'section-label' }, 'Proyectos'));
    const plist = el('div', { class: 'list' });
    for (const p of projects) {
      const pct = Store.computeProgress(p.steps);
      plist.appendChild(el('div', { class: 'card' }, [
        el('div', { class: 'card-row', style: 'justify-content:space-between;' }, [el('div', {}, p.title), el('div', { class: 'mono' }, `${pct}%`)]),
        el('div', { class: 'progress-bar', style: 'margin-top:8px;' }, el('div', { style: `width:${pct}%` })),
      ]));
    }
    container.appendChild(plist);
  }
}

function statBox(num, label) {
  return el('div', { class: 'stat-box' }, [el('div', { class: 'num' }, String(num)), el('div', { class: 'label' }, label)]);
}
