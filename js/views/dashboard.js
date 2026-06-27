// ritmo/js/views/dashboard.js
import { el, toast, todayISO, formatDateEs } from '../ui.js';
import * as Store from '../store.js';
import * as R from '../recurrence.js';
import * as Push from '../push.js';
import * as Weather from '../weather.js';

export const fab = null;

export async function render(container) {
  const today = R.toDateOnly(todayISO());
  const settings = Store.getSettings();

  const weatherSlot = el('div');
  container.appendChild(weatherSlot);
  if (settings.weatherEnabled) {
    weatherSlot.appendChild(el('div', { class: 'dash-card' }, [el('h3', {}, '🌤️ Cargando el clima…')]));
    Weather.getTodaySuggestion().then(s => {
      weatherSlot.innerHTML = '';
      weatherSlot.appendChild(renderWeatherCard(s, settings));
    });
  }

  const tasks = Store.listTasks().filter(t => !t.archived);
  const dueToday = [], overdue = [], soon = [];
  for (const t of tasks) {
    if (t.type === 'once' && t.completed) continue;
    const due = t.type === 'once' ? t.dueDate : t.currentDueDate;
    if (!due) continue;
    const status = R.classifyStatus(R.toDateOnly(due), today, settings.proximoWindowDays);
    if (status === 'vencido') overdue.push(t);
    else if (status === 'hoy') dueToday.push(t);
    else if (status === 'proximo') soon.push(t);
  }

  const totalMinutes = [...overdue, ...dueToday].reduce((s, t) => s + (t.estimatedMinutes || 0), 0);

  container.appendChild(el('div', { class: 'stat-grid', style: 'margin-bottom:6px;' }, [
    statBox(overdue.length, 'Vencidas', 'var(--terracotta)'),
    statBox(dueToday.length, 'Para hoy', 'var(--ochre)'),
  ]));
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
      el('p', {}, 'No se pudo conectar con el servicio de clima ahora.'),
    ]);
  }
  const tempLine = `${Math.round(s.raw.tempMin)}° – ${Math.round(s.raw.tempMax)}° · ${settings.locationLabel}`;
  return el('div', { class: 'dash-card' }, [
    el('h3', {}, s.rainy ? '🌧️ ' + tempLine : (s.veryHot ? '☀️ ' + tempLine : '🌤️ ' + tempLine)),
    el('p', {}, s.summary),
    el('p', { style: 'margin-top:6px;opacity:.85;' }, s.laundryNote),
  ]);
}

function buildList(items, status) {
  const list = el('div', { class: 'list' });
  items
    .slice()
    .sort((a, b) => ((a.type === 'once' ? a.dueDate : a.currentDueDate) || '').localeCompare((b.type === 'once' ? b.dueDate : b.currentDueDate) || ''))
    .forEach(t => list.appendChild(renderRow(t, status)));
  return list;
}

function renderRow(t, status) {
  const cat = t.categoryId ? Store.getCategory(t.categoryId) : null;
  const card = el('div', { class: 'card' });
  card.appendChild(el('div', { class: `status-rail ${status}` }));
  const check = el('div', { class: 'check' });
  check.innerHTML = '<svg viewBox="0 0 24 24"><path d="M4 12l5 5L20 6" stroke="white" fill="none" stroke-width="2.5"/></svg>';
  check.addEventListener('click', () => {
    if (t.type === 'once') { Store.completeTask(t.id); Push.syncTaskReminder(t.id); }
    else {
      const updated = Store.completeTask(t.id, { computeNextDueDate: R.computeNextDueDate });
      Push.syncTaskReminder(updated.id);
    }
    toast('Listo ✓');
  });
  const body = el('div', { class: 'card-body' }, [
    el('div', { class: 'card-title' }, t.title),
    el('div', { class: 'card-meta' }, cat ? [el('span', { class: 'cat-pill', style: `background:${cat.color}` }, `${cat.icon || ''} ${cat.name}`)] : []),
  ]);
  card.appendChild(el('div', { class: 'card-row' }, [check, body]));
  return card;
}
