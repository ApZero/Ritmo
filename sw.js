// ritmo/sw.js
// Service worker: cachea el "shell" de la app para que funcione offline, y
// recibe las notificaciones push enviadas desde la función de Supabase.

const CACHE_NAME = 'ritmo-cache-v10';
const SHELL_FILES = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/styles.css',
  './js/app.js',
  './js/ui.js',
  './js/store.js',
  './js/recurrence.js',
  './js/weather.js',
  './js/push.js',
  './js/supabaseClient.js',
  './js/views/dashboard.js',
  './js/views/tasks.js',
  './js/views/projects.js',
  './js/views/calendar.js',
  './js/views/stats.js',
  './js/views/categories.js',
  './js/views/settings.js',
  './js/views/stepTree.js',
  './js/views/trip.js',
  './js/views/taskPicker.js',
  './js/views/todayList.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_FILES)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  // Red primero para que siempre veas la versión más nueva si hay internet;
  // si falla (sin conexión), cae al cache — así la app funciona offline.
  event.respondWith(
    fetch(event.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return res;
      })
      .catch(() => caches.match(event.request))
  );
});

// ---------- notificaciones push ----------

self.addEventListener('push', (event) => {
  let data = { title: 'Ritmo', body: 'Tenés un recordatorio.' };
  try { if (event.data) data = event.data.json(); } catch (e) { /* payload no era JSON */ }
  event.waitUntil(
    self.registration.showNotification(data.title || 'Ritmo', {
      body: data.body || '',
      icon: './icons/icon-192.png',
      badge: './icons/icon-192.png',
      tag: data.taskId || undefined,
      data: { taskId: data.taskId, url: './index.html' },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || './index.html';
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((clients) => {
      for (const client of clients) {
        if (client.url.includes('index.html') && 'focus' in client) return client.focus();
      }
      return self.clients.openWindow(url);
    })
  );
});
