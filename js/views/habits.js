// ritmo/js/views/habits.js
import { el, openSheet, closeSheet, toast } from '../ui.js';
import * as Store from '../store.js';

const WEEKDAY_SHORT = ['Do', 'Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá'];
const WEEKDAY_NAMES = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MONTH_NAMES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
const PALETTE = ['#748B5C','#BF5B3E','#3E6259','#C98F2A','#9C9277','#5B7A8C','#8C5B7A','#5B6B8C'];

// ---------- date helpers ----------

function toISO(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function fromISO(s) { const [y,m,d] = s.split('-').map(Number); return new Date(y, m-1, d); }
function todayStr() { return toISO(new Date()); }
function addDays(d, n) { const r = new Date(d); r.setDate(r.getDate()+n); return r; }
function mondayOf(d) {
  const dt = new Date(d);
  const dow = dt.getDay(); // 0=sun
  dt.setDate(dt.getDate() - (dow === 0 ? 6 : dow - 1));
  dt.setHours(0,0,0,0);
  return dt;
}
function weekDays(monday) { return Array.from({length:7}, (_,i) => addDays(monday, i)); }

// ---------- stats engine ----------

function weekEntriesCount(entries, monday) {
  const set = new Set(entries);
  let n = 0;
  for (let i = 0; i < 7; i++) { if (set.has(toISO(addDays(monday, i)))) n++; }
  return n;
}

function monthEntriesCount(entries, year, month0) {
  const prefix = `${year}-${String(month0+1).padStart(2,'0')}-`;
  return entries.filter(e => e.startsWith(prefix)).length;
}

/** Calcula el objetivo semanal para esta semana y los días pasados. */
function weekTarget(rule, monday) {
  const today = new Date(); today.setHours(0,0,0,0);
  switch (rule.type) {
    case 'daily': {
      let days = 0;
      for (let i = 0; i < 7; i++) { const d = addDays(monday, i); if (d <= today) days++; }
      return days;
    }
    case 'times_per_week': return rule.timesPerWeek || 3;
    case 'specific_days': {
      const set = new Set(rule.weekdays || []);
      let days = 0;
      for (let i = 0; i < 7; i++) {
        const d = addDays(monday, i);
        if (set.has(d.getDay()) && d <= today) days++;
      }
      return days;
    }
    case 'times_per_month': return rule.timesPerMonth || 10;
    default: return 7;
  }
}

export function habitStats(habit) {
  const entries = new Set(habit.entries);
  const today = new Date(); today.setHours(0,0,0,0);
  const todayISO = toISO(today);
  const monday = mondayOf(today);
  const rule = habit.rule;

  // Current streak
  let streak = 0;
  if (rule.type === 'daily') {
    let d = new Date(today);
    while (entries.has(toISO(d))) { streak++; d = addDays(d, -1); }
  } else if (rule.type === 'specific_days') {
    const target = new Set(rule.weekdays || []);
    let d = new Date(today);
    for (let i = 0; i < 365; i++) {
      if (target.has(d.getDay())) {
        if (entries.has(toISO(d))) streak++;
        else break;
      }
      d = addDays(d, -1);
    }
  } else if (rule.type === 'times_per_week') {
    const goal = rule.timesPerWeek || 3;
    let mon = new Date(monday);
    for (let w = 0; w < 52; w++) {
      const count = weekEntriesCount([...entries], mon);
      const isCurrentWeek = toISO(mon) === toISO(monday);
      if (count >= goal) { streak++; }
      else if (isCurrentWeek) { /* partial, don't break */ }
      else break;
      mon = addDays(mon, -7);
    }
  } else if (rule.type === 'times_per_month') {
    const goal = rule.timesPerMonth || 10;
    let y = today.getFullYear(), m = today.getMonth();
    for (let i = 0; i < 24; i++) {
      const count = monthEntriesCount([...entries], y, m);
      const isCurrentMonth = y === today.getFullYear() && m === today.getMonth();
      if (count >= goal) { streak++; }
      else if (isCurrentMonth) { /* partial */ }
      else break;
      m--; if (m < 0) { m = 11; y--; }
    }
  }

  // Best streak (daily only for now, others get current)
  let bestStreak = streak;
  if (rule.type === 'daily' && habit.entries.length > 0) {
    const sorted = [...habit.entries].sort();
    let cur = 1, best = 1;
    for (let i = 1; i < sorted.length; i++) {
      const prev = fromISO(sorted[i-1]), curr = fromISO(sorted[i]);
      const diff = Math.round((curr - prev) / 86400000);
      if (diff === 1) { cur++; best = Math.max(best, cur); }
      else cur = 1;
    }
    bestStreak = best;
  }

  // Last 30 days completion
  const last30 = [];
  for (let i = 0; i < 30; i++) last30.push(toISO(addDays(today, -i)));
  const markedLast30 = last30.filter(d => entries.has(d)).length;
  const rate30 = Math.round((markedLast30 / 30) * 100);

  // This week progress
  const weekMarked = weekEntriesCount([...entries], monday);
  const weekGoal = weekTarget(rule, monday);

  // This month progress
  const monthMarked = monthEntriesCount([...entries], today.getFullYear(), today.getMonth());
  const monthGoal = rule.type === 'times_per_month' ? (rule.timesPerMonth || 10)
    : rule.type === 'daily' ? today.getDate()
    : rule.type === 'specific_days' ? countTargetDaysPassedInMonth(rule, today)
    : Math.round((rule.timesPerWeek || 3) * 4.33);

  return { streak, bestStreak, rate30, weekMarked, weekGoal, monthMarked, monthGoal };
}

function countTargetDaysPassedInMonth(rule, today) {
  const target = new Set(rule.weekdays || []);
  let count = 0;
  const d = new Date(today.getFullYear(), today.getMonth(), 1);
  while (d <= today) { if (target.has(d.getDay())) count++; d.setDate(d.getDate()+1); }
  return count;
}

// ---------- main list view ----------

export const fab = { label: 'Nuevo hábito', onClick: () => openHabitForm(null) };

export function renderHabitList(container) {
  const habits = Store.listHabits().filter(h => !h.archived);
  if (!habits.length) {
    container.appendChild(el('div', { class: 'empty-state' }, [
      el('div', { class: 'glyph' }, '🌱'),
      el('div', {}, 'Todavía no creaste hábitos. Tocá + para empezar.'),
    ]));
    return;
  }
  const list = el('div', { class: 'list', style: 'padding-top:8px;' });
  for (const h of habits) list.appendChild(renderHabitCard(h));
  container.appendChild(list);
}

function renderHabitCard(h) {
  const stats = habitStats(h);
  const entries = new Set(h.entries);
  const today = new Date(); today.setHours(0,0,0,0);
  const monday = mondayOf(today);
  const days = weekDays(monday);

  const card = el('div', { class: 'card' });
  // Color rail
  card.appendChild(el('div', { style: `position:absolute;left:0;top:0;bottom:0;width:4px;background:${h.color};border-radius:4px 0 0 4px;` }));

  // Header row: icon+name, streak badge
  const header = el('div', { style: 'display:flex;align-items:baseline;justify-content:space-between;gap:8px;margin-bottom:8px;cursor:pointer;' });
  header.appendChild(el('div', { style: 'display:flex;align-items:center;gap:7px;' }, [
    el('span', { style: 'font-size:18px;' }, h.icon),
    el('span', { style: 'font-size:15px;font-weight:600;' }, h.name),
  ]));
  const badges = el('div', { style: 'display:flex;gap:5px;align-items:center;' });
  if (stats.streak > 0) badges.appendChild(el('span', { class: 'tag-pill', style: `background:${h.color};color:#fff;` }, `🔥 ${stats.streak}`));
  badges.appendChild(el('span', { class: 'tag-pill' }, `${stats.weekMarked}/${stats.weekGoal} sem.`));
  header.appendChild(badges);
  header.addEventListener('click', () => openHabitDetail(h));
  card.appendChild(header);

  // Week strip
  const strip = el('div', { style: 'display:flex;gap:4px;' });
  for (const day of days) {
    const iso = toISO(day);
    const marked = entries.has(iso);
    const isToday = iso === toISO(today);
    const isFuture = day > today;
    const isTarget = isTargetDay(h.rule, day);

    const cell = el('div', { style: 'flex:1;display:flex;flex-direction:column;align-items:center;gap:2px;' });
    cell.appendChild(el('div', { style: `font-size:10px;color:var(--ink-soft);` }, WEEKDAY_SHORT[day.getDay()]));

    const dot = el('div', { style: `
      width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;
      cursor:${isFuture ? 'default' : 'pointer'};
      background:${marked ? h.color : (isTarget && !isFuture ? 'var(--surface-2)' : 'var(--surface)')};
      border:${isToday ? `2.5px solid ${h.color}` : '1.5px solid var(--line)'};
      font-size:11px;color:${marked ? '#fff' : 'var(--ink-soft)'};
      opacity:${isFuture ? 0.35 : 1};
    ` }, marked ? '✓' : '');
    if (!isFuture) {
      dot.addEventListener('click', (e) => {
        e.stopPropagation();
        Store.toggleHabitEntry(h.id, iso);
        refreshCard(card, Store.getHabit(h.id));
      });
    }
    cell.appendChild(dot);
    strip.appendChild(cell);
  }
  card.appendChild(strip);

  // Progress bar
  const pct = stats.weekGoal > 0 ? Math.min(100, Math.round(stats.weekMarked / stats.weekGoal * 100)) : 0;
  card.appendChild(el('div', { class: 'progress-bar', style: 'margin-top:8px;' }, el('div', { style: `width:${pct}%;background:${h.color};` })));

  return card;
}

function refreshCard(cardEl, h) {
  const newCard = renderHabitCard(h);
  cardEl.replaceWith(newCard);
}

function isTargetDay(rule, date) {
  switch (rule.type) {
    case 'daily': return true;
    case 'specific_days': return (rule.weekdays || []).includes(date.getDay());
    default: return false; // times_per_week/month: any day is valid, no specific target to highlight
  }
}

// ---------- detail sheet ----------

function openHabitDetail(h) {
  const state = { year: new Date().getFullYear(), month: new Date().getMonth() };

  const wrap = el('div');
  function rebuild() {
    wrap.innerHTML = '';
    const habit = Store.getHabit(h.id);
    if (!habit) return;
    const stats = habitStats(habit);
    const entries = new Set(habit.entries);

    // Stats row
    wrap.appendChild(el('div', { class: 'stat-grid', style: 'padding:0;margin-bottom:14px;' }, [
      miniStat(`🔥 ${stats.streak}`, 'Racha actual'),
      miniStat(`${stats.rate30}%`, 'Últimos 30 días'),
      miniStat(String(stats.bestStreak), 'Mejor racha'),
      miniStat(`${stats.monthMarked}/${stats.monthGoal}`, 'Este mes'),
    ]));

    // Month nav
    const label = `${MONTH_NAMES[state.month]} ${state.year}`;
    const prevBtn = el('button', {}, '‹');
    prevBtn.addEventListener('click', () => { state.month--; if (state.month<0){state.month=11;state.year--;} rebuild(); });
    const nextBtn = el('button', {}, '›');
    nextBtn.addEventListener('click', () => { state.month++; if (state.month>11){state.month=0;state.year++;} rebuild(); });
    wrap.appendChild(el('div', { class: 'cal-nav', style: 'padding:0 0 10px;' }, [prevBtn, el('div', { style: 'font-size:15px;text-transform:capitalize;font-weight:600;' }, label), nextBtn]));

    // Month calendar
    const grid = el('div', { class: 'cal-grid' });
    for (const d of ['Lu','Ma','Mi','Ju','Vi','Sá','Do']) grid.appendChild(el('div', { class: 'cal-dow' }, d));
    const first = new Date(state.year, state.month, 1);
    const offset = (first.getDay()+6)%7;
    const daysInMonth = new Date(state.year, state.month+1, 0).getDate();
    const todayISO_ = todayStr();
    const today = new Date(); today.setHours(0,0,0,0);
    for (let i=0;i<offset;i++) grid.appendChild(el('div', { class: 'cal-day empty' }));
    for (let day=1;day<=daysInMonth;day++) {
      const iso = `${state.year}-${String(state.month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
      const d = new Date(state.year, state.month, day);
      const marked = entries.has(iso);
      const isTarget = isTargetDay(habit.rule, d);
      const isFuture = d > today;
      const isToday = iso === todayISO_;
      const cell = el('div', {
        class: 'cal-day' + (isToday ? ' today' : ''),
        style: `background:${marked ? habit.color : (isTarget && !isFuture ? 'var(--teal-soft)' : 'var(--surface)')};cursor:${isFuture ? 'default' : 'pointer'};opacity:${isFuture ? .45 : 1};`,
      });
      cell.appendChild(el('div', { style: `font-size:12px;color:${marked ? '#fff' : 'var(--ink)'};font-weight:${marked?'700':'400'};` }, String(day)));
      if (!isFuture) cell.addEventListener('click', () => { Store.toggleHabitEntry(h.id, iso); rebuild(); });
      grid.appendChild(cell);
    }
    wrap.appendChild(grid);

    // Edit + delete buttons
    const editBtn = el('button', { class: 'btn btn-secondary', style: 'margin-top:16px;' }, 'Editar hábito');
    editBtn.addEventListener('click', () => { closeSheet(); openHabitForm(habit); });
    const delBtn = el('button', { class: 'btn btn-danger', style: 'margin-top:8px;' }, 'Eliminar hábito');
    delBtn.addEventListener('click', () => {
      if (!confirm(`¿Eliminar "${habit.name}"? Se perderá todo el historial.`)) return;
      Store.deleteHabit(habit.id);
      closeSheet();
      toast('Hábito eliminado');
    });
    wrap.appendChild(editBtn);
    wrap.appendChild(delBtn);
  }
  rebuild();
  openSheet(wrap, { title: `${h.icon} ${h.name}` });
}

function miniStat(num, label) {
  return el('div', { class: 'stat-box', style: 'padding:10px 12px;' }, [
    el('div', { class: 'num', style: 'font-size:17px;' }, String(num)),
    el('div', { class: 'label' }, label),
  ]);
}

// ---------- create / edit form ----------

function openHabitForm(existing) {
  const isEdit = !!existing;
  let rule = existing?.rule ? JSON.parse(JSON.stringify(existing.rule)) : { type: 'daily' };
  let color = existing?.color || PALETTE[0];

  const nameInput = el('input', { type: 'text', placeholder: 'Ej: Meditar, Ejercicio, Leer…', value: existing?.name || '' });
  const iconInput = el('input', { type: 'text', placeholder: '⭐', value: existing?.icon || '', maxlength: '2', style: 'width:64px;' });
  const notesInput = el('textarea', { placeholder: 'Notas opcionales…' }, existing?.notes || '');

  // Color picker
  const colorRow = el('div', { style: 'display:flex;gap:8px;flex-wrap:wrap;' });
  PALETTE.forEach(hex => {
    const dot = el('div', { style: `width:28px;height:28px;border-radius:50%;background:${hex};cursor:pointer;border:3px solid ${hex===color?'var(--ink)':'transparent'};` });
    dot.addEventListener('click', () => { color = hex; [...colorRow.children].forEach(d => d.style.border = '3px solid transparent'); dot.style.border = '3px solid var(--ink)'; });
    colorRow.appendChild(dot);
  });

  // Rule type selector
  const ruleTypes = [['daily','Todos los días'],['times_per_week','X veces por semana'],['specific_days','Días específicos'],['times_per_month','X veces al mes']];
  const typeSeg = el('div', { class: 'segmented', style: 'flex-wrap:wrap;' });
  const typeButtons = [];
  for (const [val, label] of ruleTypes) {
    const b = el('button', { class: rule.type === val ? 'active' : '', style: 'flex:1 1 auto;font-size:12px;padding:8px 6px;' }, label);
    b.addEventListener('click', () => { rule = { type: val }; typeButtons.forEach(x => x.className=''); b.className='active'; rebuildRuleDetails(); });
    typeButtons.push(b); typeSeg.appendChild(b);
  }

  const ruleDetails = el('div', { style: 'margin-top:8px;' });
  function rebuildRuleDetails() {
    ruleDetails.innerHTML = '';
    if (rule.type === 'times_per_week') {
      const n = el('input', { type:'number', min:'1', max:'7', value: rule.timesPerWeek||3 });
      n.addEventListener('input', () => { rule.timesPerWeek = Math.min(7, Math.max(1, Number(n.value)||3)); });
      ruleDetails.appendChild(el('div', { class:'field' }, [el('label',{},'Cuántas veces por semana'), n]));
    } else if (rule.type === 'specific_days') {
      rule.weekdays = rule.weekdays || [1,2,3,4,5];
      const grid = el('div', { class:'weekday-grid' });
      for (let i=0;i<7;i++) {
        const b = el('button', { class: rule.weekdays.includes(i)?'active':'' }, WEEKDAY_SHORT[i]);
        b.addEventListener('click', () => {
          if (rule.weekdays.includes(i)) rule.weekdays = rule.weekdays.filter(x=>x!==i);
          else rule.weekdays.push(i);
          b.className = rule.weekdays.includes(i)?'active':'';
        });
        grid.appendChild(b);
      }
      ruleDetails.appendChild(el('div', { class:'field' }, [el('label',{},'Días de la semana'), grid]));
    } else if (rule.type === 'times_per_month') {
      const n = el('input', { type:'number', min:'1', max:'31', value: rule.timesPerMonth||10 });
      n.addEventListener('input', () => { rule.timesPerMonth = Math.min(31, Math.max(1, Number(n.value)||10)); });
      ruleDetails.appendChild(el('div', { class:'field' }, [el('label',{},'Cuántas veces al mes'), n]));
    }
  }
  rebuildRuleDetails();

  const startInput = el('input', { type:'date', value: existing?.startDate || new Date().toISOString().slice(0,10) });

  const saveBtn = el('button', { class:'btn btn-primary' }, isEdit ? 'Guardar cambios' : 'Crear hábito');
  saveBtn.addEventListener('click', () => {
    const name = nameInput.value.trim();
    if (!name) { toast('Poné un nombre.'); return; }
    const patch = { name, icon: iconInput.value.trim() || '⭐', color, rule, notes: notesInput.value, startDate: startInput.value };
    if (isEdit) { Store.updateHabit(existing.id, patch); toast('Hábito actualizado'); }
    else { Store.createHabit(patch); toast('Hábito creado'); }
    closeSheet();
  });

  const body = [
    el('div', { class:'field' }, [el('label',{},'Nombre'), nameInput]),
    el('div', { class:'row2' }, [
      el('div', { class:'field' }, [el('label',{},'Ícono'), iconInput]),
      el('div', { class:'field', style:'flex:3;' }, [el('label',{},'Color'), colorRow]),
    ]),
    el('div', { class:'field' }, [el('label',{},'Frecuencia'), typeSeg, ruleDetails]),
    el('div', { class:'field' }, [el('label',{},'Inicio'), startInput]),
    el('div', { class:'field' }, [el('label',{},'Notas'), notesInput]),
    el('div', { class:'btn-row' }, [saveBtn]),
  ];
  openSheet(el('div', {}, body), { title: isEdit ? 'Editar hábito' : 'Nuevo hábito' });
}
