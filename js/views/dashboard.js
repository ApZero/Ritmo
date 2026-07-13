// ritmo/js/views/dashboard.js
import { el, toast, todayISO, formatDateEs, escapeHtml } from '../ui.js';
import * as Store from '../store.js';
import * as R from '../recurrence.js';
import * as Push from '../push.js';
import * as Weather from '../weather.js';
import { renderTripPill, openActiveTripSheet } from './trip.js';

export const fab = null;

// Normaliza tareas y pasos de proyecto a una forma común para mostrarlos juntos.
function toItem(entry) {
  if (entry.step) {
    const { project, step } = entry;
    return {
      kind: 'step', id: step.id, title: step.title, due: step.dueDate, estimatedMinutes: step.estimatedMinutes || 0,
      pillLabel: `📁 ${project.title}`, comment: null,
      onComplete: () => { Store.toggleStepCompleted(project.steps, step.id, true); Store.save(); },
    };
  }
  const t = entry;
  return {
    kind: 'task', id: t.id, title: t.title, due: t.type === 'once' ? t.dueDate : t.currentDueDate, estimatedMinutes: t.estimatedMinutes || 0,
    pillLabel: null, comment: t.type !== 'once' ? t.pendingComment : null,
    onComplete: () => {
      if (t.type === 'once') { Store.completeTask(t.id); Push.syncTaskReminder(t.id); }
      else { const updated = Store.completeTask(t.id, { computeNextDueDate: R.computeNextDueDate }); Push.syncTaskReminder(updated.id); }
    },
  };
}

export async function render(container) {
  const today = R.toDateOnly(todayISO());
  const settings = Store.getSettings();

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

  // Pill row: counts + special day + trip button
  const pillRow = el('div', { class: 'header-pills' });
  if (overdue.length) pillRow.appendChild(el('span', { class: 'header-pill count-vencido' }, `${overdue.length} vencida${overdue.length !== 1 ? 's' : ''}`));
  if (dueToday.length) pillRow.appendChild(el('span', { class: 'header-pill count-hoy' }, `${dueToday.length} para hoy`));
  const special = Store.getSpecialDay(todayISO());
  const weekend = Store.isWeekend(todayISO());
  if (special) pillRow.appendChild(el('span', { class: 'header-pill special-day' }, `${special.type === 'feriado' ? '📌' : '🌿'} ${special.label}`));
  else if (weekend) pillRow.appendChild(el('span', { class: 'header-pill special-day' }, '🌤️ Fin de semana'));
  const refresh = () => { container.innerHTML = ''; render(container); };
  renderTripPill(pillRow, refresh);
  container.appendChild(pillRow);

  // Weather card (async)
  if (settings.weatherEnabled) {
    const weatherSlot = el('div');
    container.appendChild(weatherSlot);
    weatherSlot.appendChild(el('div', { class: 'dash-card' }, el('div', { style: 'font-size:12px;text-align:center;opacity:.7;' }, '🌤️ Cargando clima…')));
    Weather.getTodaySuggestion().then(s => {
      weatherSlot.innerHTML = '';
      weatherSlot.appendChild(renderWeatherCard(s));
    });
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

function renderWeatherCard(s) {
  if (!s) {
    return el('div', { class: 'dash-card', style: 'background:var(--sand);' }, [
      el('div', { style: 'font-size:12px;text-align:center;' }, 'Clima no disponible.'),
    ]);
  }
  return el('div', { class: 'dash-card' }, [buildForecastStrip(s.days)]);
}

function buildForecastStrip(days) {
  const strip = el('div', { style: 'display:flex;gap:6px;' });
  for (const d of days.slice(0, 5)) {
    const [y, m, dd] = d.date.split('-').map(Number);
    const dayName = new Date(y, m - 1, dd).toLocaleDateString('es-PY', { weekday: 'short' });
    strip.appendChild(el('div', { style: 'flex:1;background:rgba(255,255,255,.14);border-radius:10px;padding:7px 4px;text-align:center;' }, [
      el('div', { style: 'font-size:10.5px;opacity:.8;text-transform:capitalize;' }, dayName.replace('.', '')),
      el('div', { style: 'font-size:15px;margin:3px 0;' }, Weather.weatherEmoji(d.code)),
      el('div', { class: 'mono', style: 'font-size:10px;white-space:nowrap;' }, `${Math.round(d.tempMin)}°–${Math.round(d.tempMax)}°`),
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

  const titleRow = el('div', { style: 'display:flex;justify-content:space-between;align-items:baseline;gap:10px;' }, [
    el('div', { class: 'card-title', style: 'min-width:0;' }, it.title),
    el('span', { class: `countdown ${status}`, style: 'flex:0 0 auto;white-space:nowrap;' }, R.humanizeCountdown(R.toDateOnly(it.due), today())),
  ]);
  const body = el('div', { class: 'card-body' }, [titleRow]);
  if (it.pillLabel) {
    body.appendChild(el('div', { class: 'card-meta' }, el('span', { class: 'cat-pill', style: 'background:var(--teal)' }, it.pillLabel)));
  }
  if (it.comment) {
    body.appendChild(el('div', { class: 'card-comment' }, `💬 ${escapeHtml(it.comment)}`));
  }
  card.appendChild(el('div', { class: 'card-row' }, [check, body]));
  return card;
}

function today() { return R.toDateOnly(todayISO()); }
