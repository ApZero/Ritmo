// ritmo/js/recurrence.js
// Motor de recurrencia: calcula la próxima fecha de vencimiento de una tarea
// recurrente. No depende de UI ni de almacenamiento — son funciones puras
// sobre fechas, así se pueden probar de forma aislada.
//
// Una RecurrenceRule tiene esta forma:
// {
//   mode: 'every' | 'after',       // 'every' = fechas fijas; 'after' = depende de la última vez completada
//   unit: 'day' | 'week' | 'month' | 'year',
//   interval: number,              // N
//   anchorDate: 'YYYY-MM-DD',      // fecha de referencia (fase) — solo se usa en mode:'every'
//   weekdays: [0..6],              // solo unit:'week' + mode:'every' (0=domingo)
//   monthRule: {                   // solo unit:'month' | 'year' + mode:'every'
//     kind: 'dayOfMonth' | 'nthWeekday',
//     day: 1..31 | 'last',         // si kind === 'dayOfMonth'
//     n: 1..4 | -1,                // si kind === 'nthWeekday' (-1 = último)
//     weekday: 0..6                // si kind === 'nthWeekday'
//   },
//   month: 1..12                   // solo unit:'year' (mes del aniversario)
// }

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEKDAY_NAMES = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const WEEKDAY_SHORT = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const MONTH_NAMES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
  'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

// ---------- utilidades de fecha (todo en horario local, sin horas) ----------

/** Normaliza a medianoche local y devuelve un nuevo Date. Acepta Date o 'YYYY-MM-DD'. */
export function toDateOnly(d) {
  if (typeof d === 'string') {
    const [y, m, day] = d.split('-').map(Number);
    return new Date(y, m - 1, day);
  }
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Convierte un Date a 'YYYY-MM-DD' (local). */
export function toISODate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function addDays(d, n) {
  const r = toDateOnly(d);
  r.setDate(r.getDate() + n);
  return r;
}

export function lastDayOfMonth(year, monthIndex0) {
  return new Date(year, monthIndex0 + 1, 0).getDate();
}

/** Suma meses respetando fin de mes (ej: 31 ene + 1 mes -> 28/29 feb, no 3 marzo). */
export function addMonthsClamped(d, n) {
  const date = toDateOnly(d);
  const day = date.getDate();
  const total = date.getMonth() + n;
  const year = date.getFullYear() + Math.floor(total / 12);
  const monthIndex0 = ((total % 12) + 12) % 12;
  const clampedDay = Math.min(day, lastDayOfMonth(year, monthIndex0));
  return new Date(year, monthIndex0, clampedDay);
}

export function addYearsClamped(d, n) {
  const date = toDateOnly(d);
  const year = date.getFullYear() + n;
  const monthIndex0 = date.getMonth();
  const clampedDay = Math.min(date.getDate(), lastDayOfMonth(year, monthIndex0));
  return new Date(year, monthIndex0, clampedDay);
}

function daysBetween(a, b) {
  return Math.round((toDateOnly(b).getTime() - toDateOnly(a).getTime()) / DAY_MS);
}

function startOfWeek(d) {
  // Semana empieza el lunes.
  const date = toDateOnly(d);
  const dow = (date.getDay() + 6) % 7; // 0 = lunes
  return addDays(date, -dow);
}

function weeksBetween(a, b) {
  return Math.round(daysBetween(startOfWeek(a), startOfWeek(b)) / 7);
}

function monthsBetween(a, b) {
  const da = toDateOnly(a), db = toDateOnly(b);
  return (db.getFullYear() - da.getFullYear()) * 12 + (db.getMonth() - da.getMonth());
}

function yearsBetween(a, b) {
  return toDateOnly(b).getFullYear() - toDateOnly(a).getFullYear();
}

/** N-ésima ocurrencia de un día de semana en un mes. n=-1 significa "el último". Devuelve null si no existe (ej. 5to lunes). */
export function nthWeekdayOfMonth(year, monthIndex0, weekday, n) {
  if (n === -1) {
    const last = new Date(year, monthIndex0 + 1, 0);
    const diff = (last.getDay() - weekday + 7) % 7;
    return addDays(last, -diff);
  }
  const first = new Date(year, monthIndex0, 1);
  const diff = (weekday - first.getDay() + 7) % 7;
  const day = 1 + diff + (n - 1) * 7;
  if (day > lastDayOfMonth(year, monthIndex0)) return null;
  return new Date(year, monthIndex0, day);
}

/** Resuelve el día objetivo de un monthRule para un año/mes dado. Devuelve Date o null. */
function resolveMonthRuleDate(monthRule, year, monthIndex0) {
  if (monthRule.kind === 'dayOfMonth') {
    if (monthRule.day === 'last') {
      return new Date(year, monthIndex0, lastDayOfMonth(year, monthIndex0));
    }
    const day = Math.min(monthRule.day, lastDayOfMonth(year, monthIndex0));
    return new Date(year, monthIndex0, day);
  }
  // nthWeekday
  return nthWeekdayOfMonth(year, monthIndex0, monthRule.weekday, monthRule.n);
}

// ---------- validación de ocurrencia (para mode: 'every') ----------

/** ¿Esta fecha es una ocurrencia válida según la regla? (ignora si ya pasó o no) */
function isOccurrence(rule, date) {
  const anchor = toDateOnly(rule.anchorDate);
  switch (rule.unit) {
    case 'day':
      return daysBetween(anchor, date) % rule.interval === 0;
    case 'week': {
      if (!rule.weekdays || !rule.weekdays.includes(date.getDay())) return false;
      return weeksBetween(anchor, date) % rule.interval === 0;
    }
    case 'month': {
      if (monthsBetween(anchor, date) % rule.interval !== 0) return false;
      const target = resolveMonthRuleDate(rule.monthRule, date.getFullYear(), date.getMonth());
      return !!target && toISODate(target) === toISODate(date);
    }
    case 'year': {
      if (date.getMonth() !== rule.month - 1) return false;
      if (yearsBetween(anchor, date) % rule.interval !== 0) return false;
      const target = resolveMonthRuleDate(rule.monthRule, date.getFullYear(), date.getMonth());
      return !!target && toISODate(target) === toISODate(date);
    }
    default:
      return false;
  }
}

/**
 * Primera ocurrencia válida en o después de `fromDate` (inclusive).
 * Recorre día por día con un límite de seguridad de ~6 años.
 */
export function firstOccurrenceOnOrAfter(rule, fromDate) {
  let d = toDateOnly(fromDate);
  const limit = addDays(d, 366 * 6);
  while (d.getTime() <= limit.getTime()) {
    if (isOccurrence(rule, d)) return d;
    d = addDays(d, 1);
  }
  return null; // regla imposible (ej. 5to lunes de un mes que nunca lo tiene)
}

/** Siguiente ocurrencia estrictamente después de `fromDueDate` (para mode:'every'). */
export function nextEveryDate(rule, fromDueDate) {
  return firstOccurrenceOnOrAfter(rule, addDays(fromDueDate, 1));
}

/** Próxima fecha para mode:'after' — cuenta desde la fecha de finalización real. */
export function afterCompletionDate(rule, completionDate) {
  const base = toDateOnly(completionDate);
  switch (rule.unit) {
    case 'day': return addDays(base, rule.interval);
    case 'week': return addDays(base, rule.interval * 7);
    case 'month': return addMonthsClamped(base, rule.interval);
    case 'year': return addYearsClamped(base, rule.interval);
    default: return base;
  }
}

/**
 * Calcula la próxima fecha de vencimiento tras completar una tarea recurrente.
 * @param {object} rule
 * @param {Date} previousDueDate - la fecha que se estaba cumpliendo
 * @param {Date} completionDate - cuándo se marcó como hecha realmente (hoy)
 */
export function computeNextDueDate(rule, previousDueDate, completionDate) {
  if (rule.mode === 'after') {
    return afterCompletionDate(rule, completionDate);
  }
  return nextEveryDate(rule, previousDueDate);
}

/** Fecha de vencimiento inicial al crear la tarea (busca la 1ra ocurrencia válida desde startDate). */
export function computeInitialDueDate(rule, startDate) {
  if (rule.mode === 'after') {
    return toDateOnly(startDate);
  }
  if (!rule.anchorDate) rule.anchorDate = toISODate(startDate);
  return firstOccurrenceOnOrAfter(rule, startDate) || toDateOnly(startDate);
}

// ---------- clasificación de estado y texto humano ----------

/**
 * Clasifica una fecha de vencimiento respecto a hoy.
 * @param {number} proximoWindowDays - cuántos días hacia adelante cuentan como "próximo"
 */
export function classifyStatus(dueDate, today, proximoWindowDays = 7) {
  const diff = daysBetween(today, dueDate);
  if (diff < 0) return 'vencido';
  if (diff === 0) return 'hoy';
  if (diff <= proximoWindowDays) return 'proximo';
  return 'a_tiempo';
}

const STATUS_LABELS = {
  vencido: 'Vencido',
  hoy: 'Hoy',
  proximo: 'Próximo',
  a_tiempo: 'A tiempo',
};
export function statusLabel(status) {
  return STATUS_LABELS[status] || status;
}

function pickAmountUnit(n) {
  if (n < 14) return [n, n === 1 ? 'día' : 'días'];
  if (n < 60) { const a = Math.round(n / 7); return [a, a === 1 ? 'semana' : 'semanas']; }
  if (n < 730) { const a = Math.round(n / 30.44); return [a, a === 1 ? 'mes' : 'meses']; }
  const a = Math.round(n / 365.25); return [a, a === 1 ? 'año' : 'años'];
}

/** Texto de cuenta atrás/regresiva, ej: "En 3 días", "Vencido hace 2 semanas", "Hoy". */
export function humanizeCountdown(dueDate, today) {
  const diff = daysBetween(today, dueDate);
  if (diff === 0) return 'Hoy';
  const past = diff < 0;
  const [amount, unit] = pickAmountUnit(Math.abs(diff));
  return past ? `Vencido hace ${amount} ${unit}` : `En ${amount} ${unit}`;
}

/** Texto de "hace cuánto" para la última vez (siempre en el pasado), ej: "Hace 4 días", "Hoy". */
export function humanizeSince(pastDate, today) {
  if (!pastDate) return null;
  const diff = daysBetween(pastDate, today);
  if (diff <= 0) return 'Hoy';
  const [amount, unit] = pickAmountUnit(diff);
  return `Hace ${amount} ${unit}`;
}

/** Descripción legible de la regla en español, para mostrar en listas/formularios. */
export function humanizeRule(rule) {
  const every = (n, singular, plural) => n === 1 ? `cada ${singular}` : `cada ${n} ${plural}`;
  if (rule.mode === 'after') {
    const map = {
      day: every(rule.interval, 'día', 'días'),
      week: every(rule.interval, 'semana', 'semanas'),
      month: every(rule.interval, 'mes', 'meses'),
      year: every(rule.interval, 'año', 'años'),
    };
    return `${map[rule.unit]}, después de completarse`;
  }
  switch (rule.unit) {
    case 'day':
      return `${every(rule.interval, 'día', 'días')} (fecha fija)`;
    case 'week': {
      const days = (rule.weekdays || []).map(w => WEEKDAY_NAMES[w]).join(', ');
      return `${every(rule.interval, 'semana', 'semanas')}, los ${days}`;
    }
    case 'month': {
      const mr = rule.monthRule;
      const when = mr.kind === 'dayOfMonth'
        ? (mr.day === 'last' ? 'el último día' : `el día ${mr.day}`)
        : `el ${nthLabel(mr.n)} ${WEEKDAY_NAMES[mr.weekday]}`;
      return `${every(rule.interval, 'mes', 'meses')}, ${when}`;
    }
    case 'year': {
      const mr = rule.monthRule;
      const when = mr.kind === 'dayOfMonth'
        ? (mr.day === 'last' ? 'el último día' : `el día ${mr.day}`)
        : `el ${nthLabel(mr.n)} ${WEEKDAY_NAMES[mr.weekday]}`;
      return `${every(rule.interval, 'año', 'años')}, ${when} de ${MONTH_NAMES[rule.month - 1]}`;
    }
    default:
      return '';
  }
}

function nthLabel(n) {
  if (n === -1) return 'último';
  return ['primer', 'segundo', 'tercer', 'cuarto'][n - 1] || `${n}°`;
}

export { WEEKDAY_NAMES, WEEKDAY_SHORT, MONTH_NAMES };
