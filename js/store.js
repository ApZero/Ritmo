// ritmo/js/store.js
// Capa de datos: todo vive en localStorage bajo una sola clave, como un
// documento JSON. Exporta funciones de lectura/escritura y utilidades de
// respaldo (exportar/importar). Ninguna función aquí toca el DOM.

const STORAGE_KEY = 'ritmo:data:v1';
const SCHEMA_VERSION = 1;

function uid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'id_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function nowISO() {
  return localISOString(new Date());
}

/** Como toISOString() pero en hora LOCAL, no UTC — evita que la fecha "salte"
 * de día según el huso horario del teléfono. */
function localISOString(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${y}-${m}-${day}T${hh}:${mm}:${ss}`;
}

function dateOnlyToISO(d) {
  if (typeof d === 'string') return d.slice(0, 10);
  return localISOString(d).slice(0, 10);
}

function defaultData() {
  return {
    version: SCHEMA_VERSION,
    settings: {
      proximoWindowDays: 7,
      hideCompletedDefault: true,
      weatherEnabled: true,
      lat: -22.34,
      lon: -60.03,
      locationLabel: 'Filadelfia, Chaco, Paraguay',
      reminderDefaultTime: '09:00',
      supabaseUrl: '',
      supabaseAnonKey: '',
      vapidPublicKey: '',
      pushDeviceId: uid(),
      pushEnabled: false,
    },
    categories: [
      { id: uid(), name: 'Casa', color: '#7C8B5B', estimatedMinutes: 30, icon: '🏠' },
      { id: uid(), name: 'Salud', color: '#BF5B3E', estimatedMinutes: 20, icon: '💊' },
      { id: uid(), name: 'Finanzas', color: '#3E6259', estimatedMinutes: 30, icon: '💰' },
      { id: uid(), name: 'Chacra', color: '#D7A23A', estimatedMinutes: 45, icon: '🌱' },
    ],
    tasks: [],
    projects: [],
    specialDays: [], // feriados / días libres puntuales — los fines de semana se calculan, no se guardan
    trip: null, // { id, items:[{id,taskId?,title,done}], startedAt, endedAt|null }
  };
}

let _cache = null;

export function load() {
  if (_cache) return _cache;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) { _cache = defaultData(); return _cache; }
    const parsed = JSON.parse(raw);
    _cache = migrate(parsed);
    return _cache;
  } catch (e) {
    console.error('Error al leer datos, se inicia con datos por defecto.', e);
    _cache = defaultData();
    return _cache;
  }
}

function migrate(data) {
  // Espacio para futuras migraciones de esquema.
  if (!data.version) data.version = SCHEMA_VERSION;
  data.settings = { ...defaultData().settings, ...(data.settings || {}) };
  data.categories = data.categories || [];
  data.tasks = data.tasks || [];
  data.projects = data.projects || [];
  data.specialDays = data.specialDays || [];
  if (!('trip' in data)) data.trip = null;
  return data;
}

export function save() {
  if (!_cache) return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(_cache));
  window.dispatchEvent(new CustomEvent('ritmo:change'));
}

export function getSettings() { return load().settings; }
export function updateSettings(patch) {
  const data = load();
  data.settings = { ...data.settings, ...patch };
  save();
  return data.settings;
}

// ---------- categorías ----------

export function listCategories() { return load().categories; }
export function getCategory(id) { return load().categories.find(c => c.id === id) || null; }
export function createCategory({ name, color, estimatedMinutes, icon }) {
  const data = load();
  const cat = { id: uid(), name, color: color || '#7C8B5B', estimatedMinutes: estimatedMinutes || 0, icon: icon || '•' };
  data.categories.push(cat);
  save();
  return cat;
}
export function updateCategory(id, patch) {
  const data = load();
  const cat = data.categories.find(c => c.id === id);
  if (!cat) return null;
  Object.assign(cat, patch);
  save();
  return cat;
}
export function deleteCategory(id) {
  const data = load();
  data.categories = data.categories.filter(c => c.id !== id);
  data.tasks.forEach(t => { if (t.categoryId === id) t.categoryId = null; });
  data.projects.forEach(p => { if (p.categoryId === id) p.categoryId = null; });
  save();
}

// ---------- pasos recursivos (subtareas de tareas y de proyectos) ----------

export function newStep(title) {
  return { id: uid(), title, completed: false, completedAt: null, dueDate: null, estimatedMinutes: 0, notes: '', children: [] };
}

function walkSteps(steps, fn) {
  for (const s of steps) {
    fn(s);
    if (s.children && s.children.length) walkSteps(s.children, fn);
  }
}

export function findStep(rootSteps, stepId) {
  let found = null;
  walkSteps(rootSteps, s => { if (s.id === stepId) found = s; });
  return found;
}

/** Progreso 0-100: promedio recursivo con igual peso por hijo. Hoja: 0 o 100. */
export function computeProgress(steps) {
  if (!steps || steps.length === 0) return 0;
  let total = 0;
  for (const s of steps) {
    if (s.children && s.children.length) total += computeProgress(s.children);
    else total += s.completed ? 100 : 0;
  }
  return Math.round(total / steps.length);
}

export function toggleStepCompleted(rootSteps, stepId, completed) {
  const step = findStep(rootSteps, stepId);
  if (!step) return;
  step.completed = completed;
  step.completedAt = completed ? nowISO() : null;
  // Si tiene hijos, marcar/desmarcar todos en cascada para mantener coherencia visual.
  if (step.children && step.children.length) {
    walkSteps(step.children, s => { s.completed = completed; s.completedAt = completed ? nowISO() : null; });
  }
}

/** Todas las tareas (y pasos de proyecto) pendientes en una fecha concreta. */
export function getItemsForDate(dateStr) {
  const tasks = listTasks().filter(t => !t.archived).filter(t => {
    if (t.type === 'once' && t.completed) return false;
    const due = t.type === 'once' ? t.dueDate : t.currentDueDate;
    return due === dateStr;
  });
  const steps = listAllStepsWithDates().filter(e => e.step.dueDate === dateStr);
  return { tasks, steps };
}
/** Todos los pasos (de cualquier proyecto) que tienen una fecha asignada, con
 * referencia a su proyecto. Usado para que el dashboard y el calendario
 * muestren los pasos de proyecto junto con las tareas. */
export function listAllStepsWithDates({ includeCompleted = false } = {}) {
  const out = [];
  for (const project of load().projects) {
    if (project.archived) continue;
    walkSteps(project.steps, (step) => {
      if (!step.dueDate) return;
      if (!includeCompleted && step.completed) return;
      out.push({ project, step });
    });
  }
  return out;
}

// ---------- tareas (todo + recurrentes, unificadas) ----------

export function listTasks() { return load().tasks; }
export function getTask(id) { return load().tasks.find(t => t.id === id) || null; }

export function createTask(input) {
  const data = load();
  const task = {
    id: uid(),
    title: input.title,
    notes: input.notes || '',
    type: input.type || 'once', // 'once' | 'every' | 'after'
    categoryId: input.categoryId || null,
    tags: input.tags || [],
    estimatedMinutes: input.estimatedMinutes || 0,
    priority: input.priority || 'normal',
    subtasks: input.subtasks || [],
    dueDate: input.dueDate || null,
    completed: false,
    completedAt: null,
    rule: input.rule || null,
    currentDueDate: input.currentDueDate || null,
    pendingComment: input.pendingComment || '',
    history: [],
    reminder: input.reminder || null,
    archived: false,
    createdAt: nowISO(),
    updatedAt: nowISO(),
  };
  data.tasks.push(task);
  save();
  return task;
}

export function updateTask(id, patch) {
  const data = load();
  const task = data.tasks.find(t => t.id === id);
  if (!task) return null;
  Object.assign(task, patch, { updatedAt: nowISO() });
  save();
  return task;
}

export function deleteTask(id) {
  const data = load();
  data.tasks = data.tasks.filter(t => t.id !== id);
  save();
}

/**
 * Marca una tarea recurrente (o normal) como completada y, si corresponde,
 * calcula la próxima fecha de vencimiento. Devuelve la tarea actualizada.
 * recomputeFn: función inyectada (de recurrence.js) para no acoplar store<->recurrence.
 */
export function completeTask(id, { comment, completionDate, computeNextDueDate } = {}) {
  const data = load();
  const task = data.tasks.find(t => t.id === id);
  if (!task) return null;
  const when = completionDate || new Date();
  if (task.type === 'once') {
    task.completed = true;
    task.completedAt = localISOString(when);
  } else {
    const prevDue = task.currentDueDate;
    task.history.push({ dueDate: prevDue, completedAt: localISOString(when), comment: task.pendingComment || comment || '' });
    task.pendingComment = '';
    const next = computeNextDueDate(task.rule, prevDue, when);
    task.currentDueDate = next ? dateOnlyToISO(next) : null;
  }
  task.updatedAt = nowISO();
  save();
  return task;
}

/** Reabre una tarea 'once' marcada como completada, o deshace la última finalización recurrente. */
export function uncompleteTask(id) {
  const data = load();
  const task = data.tasks.find(t => t.id === id);
  if (!task) return null;
  if (task.type === 'once') {
    task.completed = false;
    task.completedAt = null;
  } else {
    const last = task.history.pop();
    if (last) {
      task.currentDueDate = last.dueDate;
      task.pendingComment = last.comment || '';
    }
  }
  task.updatedAt = nowISO();
  save();
  return task;
}

export function postponeTask(id, newDueDate) {
  return updateTask(id, { currentDueDate: newDueDate });
}

/** Edita una entrada del historial (fecha de finalización, fecha que vencía, o comentario). */
export function updateTaskHistoryEntry(taskId, index, patch) {
  const task = getTask(taskId);
  if (!task || !task.history[index]) return null;
  Object.assign(task.history[index], patch);
  task.history.sort((a, b) => (a.completedAt || '').localeCompare(b.completedAt || ''));
  task.updatedAt = nowISO();
  save();
  return task;
}

export function deleteTaskHistoryEntry(taskId, index) {
  const task = getTask(taskId);
  if (!task || !task.history[index]) return null;
  task.history.splice(index, 1);
  task.updatedAt = nowISO();
  save();
  return task;
}

/** Agrega una finalización pasada SIN tocar currentDueDate — para registrar
 * algo que ya pasó (a veces ya cubierto por el ciclo vigente) sin alterar la
 * próxima fecha programada. */
export function addManualHistoryEntry(taskId, { completedAt, dueDate, comment }) {
  const task = getTask(taskId);
  if (!task) return null;
  task.history.push({ dueDate: dueDate || null, completedAt, comment: comment || '' });
  task.history.sort((a, b) => (a.completedAt || '').localeCompare(b.completedAt || ''));
  task.updatedAt = nowISO();
  save();
  return task;
}

// ---------- días especiales (feriados / días libres) ----------
// Los fines de semana se calculan al vuelo (isWeekend), no se guardan acá.

export function listSpecialDays() { return load().specialDays.slice().sort((a, b) => a.date.localeCompare(b.date)); }
export function getSpecialDay(dateStr) { return load().specialDays.find(d => d.date === dateStr) || null; }
export function createSpecialDay({ date, label, type }) {
  const data = load();
  const entry = { id: uid(), date, label: label || 'Día libre', type: type || 'feriado' };
  data.specialDays.push(entry);
  save();
  return entry;
}
export function updateSpecialDay(id, patch) {
  const data = load();
  const entry = data.specialDays.find(d => d.id === id);
  if (!entry) return null;
  Object.assign(entry, patch);
  save();
  return entry;
}
export function deleteSpecialDay(id) {
  const data = load();
  data.specialDays = data.specialDays.filter(d => d.id !== id);
  save();
}

function dateOnlyLocal(y, m0, d) { return new Date(y, m0, d); }
function toISO(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }

export function isWeekend(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dow = dateOnlyLocal(y, m - 1, d).getDay();
  return dow === 0 || dow === 6;
}

/**
 * Próximos "días especiales" (fines de semana + feriados/días libres puntuales)
 * a partir de hoy — para ofrecer como atajos al elegir una fecha.
 */
export function getUpcomingSpecialDays({ from, days = 30, limit = 8 } = {}) {
  const start = from ? new Date(from) : new Date();
  const manual = load().specialDays;
  const out = [];
  for (let i = 0; i < days && out.length < limit; i++) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    const dateStr = toISO(d);
    const manualEntry = manual.find(m => m.date === dateStr);
    const weekend = d.getDay() === 0 || d.getDay() === 6;
    if (manualEntry) out.push({ date: dateStr, label: manualEntry.label, type: manualEntry.type });
    else if (weekend) out.push({ date: dateStr, label: d.getDay() === 6 ? 'Sábado' : 'Domingo', type: 'weekend' });
  }
  return out;
}

// ---------- proyectos ----------

export function listProjects() { return load().projects; }
export function getProject(id) { return load().projects.find(p => p.id === id) || null; }

export function createProject(input) {
  const data = load();
  const project = {
    id: uid(),
    title: input.title,
    description: input.description || '',
    categoryId: input.categoryId || null,
    steps: input.steps || [],
    archived: false,
    createdAt: nowISO(),
    updatedAt: nowISO(),
  };
  data.projects.push(project);
  save();
  return project;
}

export function updateProject(id, patch) {
  const data = load();
  const project = data.projects.find(p => p.id === id);
  if (!project) return null;
  Object.assign(project, patch, { updatedAt: nowISO() });
  save();
  return project;
}

export function deleteProject(id) {
  const data = load();
  data.projects = data.projects.filter(p => p.id !== id);
  save();
}

// ---------- respaldo: exportar / importar ----------

export function exportBackup() {
  const data = load();
  return {
    app: 'ritmo',
    exportedAt: nowISO(),
    version: data.version,
    payload: data,
  };
}

const AUTO_BACKUP_KEY = 'ritmo:last-auto-backup';

/**
 * Llama a esto una vez al arrancar la app. Si ya se hizo un respaldo automático
 * hoy, no hace nada. Si no, descarga el JSON y registra la fecha.
 * Devuelve true si disparó la descarga, false si ya estaba al día.
 */
export function runDailyAutoBackupIfNeeded() {
  const today = nowISO().slice(0, 10);
  const last = localStorage.getItem(AUTO_BACKUP_KEY);
  if (last === today) return false;

  try {
    const backup = exportBackup();
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ritmo-auto-${today}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    localStorage.setItem(AUTO_BACKUP_KEY, today);
    return true;
  } catch (e) {
    console.warn('Auto-respaldo falló:', e);
    return false;
  }
}

export function importBackup(json, { replace = true } = {}) {
  if (!json || json.app !== 'ritmo' || !json.payload) {
    throw new Error('Archivo de respaldo no reconocido.');
  }
  const incoming = migrate(json.payload);
  if (replace) {
    _cache = incoming;
  } else {
    // Fusión simple: agrega lo que no exista por id, conserva configuración actual.
    const current = load();
    const mergeById = (a, b) => {
      const ids = new Set(a.map(x => x.id));
      return [...a, ...b.filter(x => !ids.has(x.id))];
    };
    current.categories = mergeById(current.categories, incoming.categories);
    current.tasks = mergeById(current.tasks, incoming.tasks);
    current.projects = mergeById(current.projects, incoming.projects);
    current.specialDays = mergeById(current.specialDays, incoming.specialDays || []);
    _cache = current;
  }
  save();
  return _cache;
}

export { uid };

// ---------- viaje / trip planner ----------

export function getTrip() { return load().trip; }

export function startTrip(items) {
  // items: [{ taskId?, title, done:false }]
  const data = load();
  data.trip = { id: uid(), items: items.map(it => ({ id: uid(), ...it, done: false })), startedAt: nowISO(), endedAt: null };
  save();
  return data.trip;
}

export function updateTripItems(items) {
  const data = load();
  if (!data.trip) return null;
  data.trip.items = items;
  save();
  return data.trip;
}

export function setTripItemDone(itemId, done) {
  const data = load();
  if (!data.trip) return null;
  const item = data.trip.items.find(i => i.id === itemId);
  if (item) item.done = done;
  save();
  return data.trip;
}

export function endTrip() {
  const data = load();
  if (!data.trip) return;
  data.trip.endedAt = nowISO();
  // Pending items already exist as normal tasks — no extra action needed.
  data.trip = null;
  save();
}

export function clearTrip() {
  const data = load();
  data.trip = null;
  save();
}
