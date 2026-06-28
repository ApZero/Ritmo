// ritmo/js/views/dashboard.js
import { el, toast, todayISO, formatDateEs } from '../ui.js';
import * as Store from '../store.js';
import * as R from '../recurrence.js';
import * as Push from '../push.js';
import * as Weather from '../weather.js';

export const fab = null;

// Normaliza tareas y pasos de proyecto a una forma común para mostrarlos juntos.
function toItem(entry) {
  if (entry.step) {
    const { project, step } = entry;
    return {
      kind: 'step', id: step.id, title: step.title, due: step.dueDate, estimatedMinutes: step.estimatedMinutes || 0,
      pillLabel: `📁 ${project.title}`, pillColor: 'var(--teal)',
      onComplete: () => { Store.toggleStepCompleted(project.steps, step.id, true); Store.save(); },
    };
  }
  const t = entry;
  const cat = t.categoryId ? Store.getCategory(t.categoryId) : null;
  return {
    kind: 'task', id: t.id, title: t.title, due: t.type === 'once' ? t.dueDate : t.currentDueDate, estimatedMinutes: t.estimatedMinutes || 0,
    pillLabel: cat ? `${cat.icon || ''} ${cat.name}` : null, pillColor: cat?.color,
    onComplete: () => {
      if (t.type === 'once') { Store.completeTask(t.id); Push.syncTaskReminder(t.id); }
      else { const updated = Store.completeTask(t.id, { computeNextDueDate: R.computeNextDueDate }); Push.syncTaskReminder(updated.id); }
    },
  };
}

export async function render(container) {
  const today = R.toDateOnly(todayISO());
  const settings = Store.getSettings();

  const special = Store.getSpecialDay(todayISO());
  const weekend = Store.isWeekend(todayISO());
  if (special || weekend) {
    container.appendChild(el('div', { style: 'padding:0 18px 10px;' }, el('span', { class: 'tag-pill', style: 'background:var(--teal-soft);color:var(--teal);font-weight:600;' },
      special ? `${special.type === 'feriado' ? '📌' : '🌿'} Hoy: ${special.label}` : '🌤️ Fin de semana')));
  }

  const weatherSlot = el('div');
  container.appendChild(weatherSlot);
  if (settings.weatherEnabled) {
    weatherSlot.appendChild(el('div', { class: 'dash-card' }, [el('h3', {}, '🌤️ Cargando el clima…')]));
    Weather.getTodaySuggestion().then(s => {
      weatherSlot.innerHTML = '';
      weatherSlot.appendChild(renderWeatherCard(s, settings));
    });
  }

  const tasks = Store.listTasks().filter(t => !t.archived).filter(t => !(t.type === 'once' && t.completed));
  const steps = Store.listAllStepsWithDates();
  const allItems = [...tasks, ...steps].map(toItem).filter(it => it.due);

  const dueToday = [], overdue = [], soon = [];
  for (const it of allItems) {
    const status = R.classifyStatus(R.toDateOnly(it.due), today, settings.proximoWindowDays);
    if (status === 'vencido') overdue.push(it);
    else if (status === 'hoy') dueToday.push(it);
    else if (status === 'proximo') soon.push(it);
  }

  container.appendChild(el('div', { class: 'stat-grid', style: 'margin-bottom:6px;' }, [
    statBox(overdue.length, 'Vencidas', 'var(--terracotta)'),
    statBox(dueToday.length, 'Para hoy', 'var(--ochre)'),
  ]));
  const totalMinutes = [...overdue, ...dueToday].reduce((s, it) => s + (it.estimatedMinutes || 0), 0);
  if (totalMinutes) {
    container.appendChild(el('div', { style: 'padding:6px 18px 0;color:var(--ink-soft);font-size:12.5px;' },
      `≈ ${Math.round(totalMinutes / 60 * 10) / 10} h de trabajo entre lo vencido y lo de hoy.`));
  }

  if (overdue.length) {
    container.appendChild(el('div', { class: 'section-label' }, 'Vencido'));
    container.appendChild(buildList(overdue, 'vencido'));
  }
  if (dueToday.length) {
    container.appendChild(el('div', { class: 'section-label' }, 'Para hoy'));
    container.appendChild(buildList(dueToday, 'hoy'));
  }
  if (soon.length) {
    container.appendChild(el('div', { class: 'section-label' }, 'Próximos días'));
    container.appendChild(buildList(soon, 'proximo'));
  }
  if (!overdue.length && !dueToday.length && !soon.length) {
    container.appendChild(el('div', { class: 'empty-state' }, [
      el('div', { class: 'glyph' }, '✨'),
      el('div', {}, 'Nada urgente por ahora. Buen momento para algo de la chacra o el jardín.'),
    ]));
  }
}

function statBox(num, label, color) {
  return el('div', { class: 'stat-box' }, [
    el('div', { class: 'num', style: `color:${color}` }, String(num)),
    el('div', { class: 'label' }, label),
  ]);
}

function renderWeatherCard(s, settings) {
  if (!s) {
    return el('div', { class: 'dash-card', style: 'background:var(--sand);' }, [
      el('h3', {}, '🌤️ Clima no disponible'),
      el('p', { style: 'font-size:11.5px;opacity:.8;margin-top:4px;' }, 'No se pudo conectar con el servicio de clima ahora.'),
    ]);
  }
  const tempLine = `${Math.round(s.today.tempMin)}° – ${Math.round(s.today.tempMax)}° · ${settings.locationLabel}`;
  const card = el('div', { class: 'dash-card' }, [
    el('h3', {}, s.rainy ? '🌧️ ' + tempLine : (s.veryHot ? '☀️ ' + tempLine : '🌤️ ' + tempLine)),
    el('div', { style: 'font-size:10.5px;opacity:.65;margin-top:5px;letter-spacing:.01em;' }, `${s.summary} ${s.laundryNote}`),
  ]);
  card.appendChild(buildForecastStrip(s.days));
  return card;
}

function buildForecastStrip(days) {
  const strip = el('div', { style: 'display:flex;gap:6px;margin-top:12px;' });
  for (const d of days.slice(0, 5)) {
    const [y, m, dd] = d.date.split('-').map(Number);
    const dayName = new Date(y, m - 1, dd).toLocaleDateString('es-PY', { weekday: 'short' });
    strip.appendChild(el('div', { style: 'flex:1;background:rgba(255,255,255,.14);border-radius:10px;padding:7px 4px;text-align:center;' }, [
      el('div', { style: 'font-size:10.5px;opacity:.8;text-transform:capitalize;' }, dayName.replace('.', '')),
      el('div', { style: 'font-size:15px;margin:3px 0;' }, Weather.weatherEmoji(d.code)),
      el('div', { class: 'mono', style: 'font-size:10.5px;' }, `${Math.round(d.tempMax)}°`),
      el('div', { class: 'mono', style: 'font-size:9.5px;opacity:.7;' }, `${Math.round(d.tempMin)}°`),
    ]));
  }
  return strip;
}

function buildList(items, status) {
  const list = el('div', { class: 'list' });
  items.slice().sort((a, b) => (a.due || '').localeCompare(b.due || '')).forEach(it => list.appendChild(renderRow(it, status)));
  return list;
}

function renderRow(it, status) {
  const card = el('div', { class: 'card' });
  card.appendChild(el('div', { class: `status-rail ${status}` }));
  const check = el('div', { class: 'check' });
  check.innerHTML = '<svg viewBox="0 0 24 24"><path d="M4 12l5 5L20 6" stroke="white" fill="none" stroke-width="2.5"/></svg>';
  check.addEventListener('click', () => { it.onComplete(); toast('Listo ✓'); });
  const body = el('div', { class: 'card-body' }, [
    el('div', { class: 'card-title' }, it.title),
    el('div', { class: 'card-meta' }, it.pillLabel ? [el('span', { class: 'cat-pill', style: `background:${it.pillColor || 'var(--sand)'}` }, it.pillLabel)] : []),
  ]);
  card.appendChild(el('div', { class: 'card-row' }, [check, body]));
  return card;
}
