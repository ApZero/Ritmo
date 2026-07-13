// ritmo/js/app.js
import { icon, todayISO } from './ui.js';
import { registerServiceWorker } from './push.js';
import { runDailyAutoBackupIfNeeded } from './store.js';

import * as Hoy from './views/dashboard.js';
import * as Tareas from './views/tasks.js';
import * as Proyectos from './views/projects.js';
import * as Calendario from './views/calendar.js';
import * as Estadisticas from './views/stats.js';
import * as Categorias from './views/categories.js';
import * as Ajustes from './views/settings.js';
import * as Holidays from './views/holidays.js';

const VIEW = document.getElementById('view');
const SUBTITLE = document.getElementById('topbar-subtitle');
const TABBAR = document.getElementById('tabbar');
const FAB = document.getElementById('fab');

const TABS = [
  { id: 'hoy', label: 'Hoy', icon: 'hoy', mod: Hoy },
  { id: 'tareas', label: 'Tareas', icon: 'tareas', mod: Tareas },
  { id: 'proyectos', label: 'Proyectos', icon: 'proyectos', mod: Proyectos },
  { id: 'calendario', label: 'Calendario', icon: 'calendario', mod: Calendario },
  { id: 'mas', label: 'Más', icon: 'mas', mod: null },
];

const SUBVIEWS = {
  estadisticas: Estadisticas,
  categorias: Categorias,
  ajustes: Ajustes,
  diasespeciales: Holidays,
};

let current = 'hoy';

function renderMas() {
  VIEW.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.className = 'list';
  wrap.style.paddingTop = '8px';
  const items = [
    ['estadisticas', '📊', 'Estadísticas', 'Rachas, cumplimiento y promedios'],
    ['categorias', '🏷️', 'Categorías', 'Crear, editar, tiempos estimados'],
    ['diasespeciales', '🗓️', 'Días especiales', 'Feriados, días libres y fines de semana'],
    ['ajustes', '⚙️', 'Ajustes', 'Clima, notificaciones, respaldo'],
  ];
  for (const [id, emoji, title, desc] of items) {
    const card = document.createElement('div');
    card.className = 'card';
    card.style.cursor = 'pointer';
    card.innerHTML = `<div class="card-row"><div style="font-size:22px">${emoji}</div>
      <div class="card-body"><div class="card-title">${title}</div>
      <div class="card-meta" style="color:var(--ink-soft)">${desc}</div></div></div>`;
    card.addEventListener('click', () => navigateTo(id));
    wrap.appendChild(card);
  }
  VIEW.appendChild(wrap);
}

export function navigateTo(viewId) {
  current = viewId;
  renderTabbar();
  const titleMap = {
    hoy: '', tareas: '', proyectos: '', calendario: '',
    mas: 'Más', estadisticas: 'Estadísticas', categorias: 'Categorías', ajustes: 'Ajustes', diasespeciales: 'Días especiales',
  };
  SUBTITLE.textContent = titleMap[viewId]
    ? titleMap[viewId]
    : new Date().toLocaleDateString('es-PY', { weekday: 'long', day: 'numeric', month: 'long' });

  if (viewId === 'mas') { renderMas(); setFab(null); return; }
  const tab = TABS.find(t => t.id === viewId);
  const mod = tab ? tab.mod : SUBVIEWS[viewId];
  if (!mod) return;
  VIEW.innerHTML = '';
  mod.render(VIEW, { navigateTo });
  setFab(mod.fab || null);
}

function setFab(fabConfig) {
  if (!fabConfig) { FAB.style.display = 'none'; return; }
  FAB.style.display = 'flex';
  FAB.onclick = () => fabConfig.onClick({ navigateTo });
  FAB.setAttribute('aria-label', fabConfig.label || 'Agregar');
}

function renderTabbar() {
  TABBAR.innerHTML = '';
  for (const t of TABS) {
    const btn = document.createElement('button');
    const isActive = current === t.id || (t.id === 'mas' && SUBVIEWS[current]);
    if (isActive) btn.className = 'active';
    btn.appendChild(icon(t.icon));
    const lbl = document.createElement('span');
    lbl.textContent = t.label;
    btn.appendChild(lbl);
    btn.addEventListener('click', () => navigateTo(t.id));
    TABBAR.appendChild(btn);
  }
}

window.addEventListener('ritmo:change', () => {
  // Re-renderizar la vista actual cuando cambian los datos (ej. tras importar un respaldo).
  navigateTo(current);
});

registerServiceWorker().catch(() => {});
navigateTo('hoy');

// Respaldo automático diario — se dispara una vez por día al abrir la app.
setTimeout(() => {
  const triggered = runDailyAutoBackupIfNeeded();
  if (triggered) {
    // toast importado dinámicamente para no ensuciar el import de app.js
    import('./ui.js').then(({ toast }) => toast('📥 Respaldo diario guardado'));
  }
}, 1500);
