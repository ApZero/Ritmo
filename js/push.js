// ritmo/js/push.js
// Maneja el lado del cliente de las notificaciones push:
// - registrar el service worker
// - pedir permiso y suscribirse (clave VAPID pública)
// - mantener sincronizado en Supabase el recordatorio de cada tarea
//   (solo título, cuerpo y fecha/hora — nunca el resto de tus datos)

import { getSettings, updateSettings, getTask } from './store.js';
import * as sb from './supabaseClient.js';

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

export async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return null;
  return navigator.serviceWorker.register('./sw.js');
}

export function pushSupported() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

export function permissionState() {
  return pushSupported() ? Notification.permission : 'unsupported';
}

export async function enablePush() {
  const s = getSettings();
  if (!pushSupported()) throw new Error('Este navegador no soporta notificaciones push.');
  if (!s.vapidPublicKey) throw new Error('Falta configurar la clave pública VAPID en Ajustes.');
  if (!s.supabaseUrl || !s.supabaseAnonKey) throw new Error('Falta configurar Supabase en Ajustes.');

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Permiso de notificaciones denegado.');

  const registration = await navigator.serviceWorker.ready;
  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(s.vapidPublicKey),
    });
  }
  await sb.upsertPushSubscription(s.pushDeviceId, subscription.toJSON());
  updateSettings({ pushEnabled: true });
  return subscription;
}

export async function disablePush() {
  const s = getSettings();
  if (pushSupported()) {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (subscription) await subscription.unsubscribe();
  }
  try { await sb.deletePushSubscription(s.pushDeviceId); } catch (e) { /* sin conexión, no es crítico */ }
  updateSettings({ pushEnabled: false });
}

/** Calcula la fecha/hora exacta (Date) del recordatorio de una tarea, o null si no aplica. */
export function computeReminderDateTime(task) {
  if (!task.reminder || !task.reminder.enabled) return null;
  const dueStr = task.type === 'once' ? task.dueDate : task.currentDueDate;
  if (!dueStr) return null;
  const [y, m, d] = dueStr.split('-').map(Number);
  const [hh, mm] = (task.reminder.time || '09:00').split(':').map(Number);
  const dt = new Date(y, m - 1, d, hh, mm, 0, 0);
  dt.setDate(dt.getDate() - (task.reminder.offsetDays || 0));
  return dt;
}

/**
 * Sincroniza (o borra) el recordatorio de una tarea en Supabase según su
 * estado actual. Se llama después de crear/editar/completar/borrar una tarea.
 * Falla en silencio si no hay conexión o no está configurado — los datos
 * locales son la fuente de verdad, esto es solo el envío del aviso.
 */
export async function syncTaskReminder(taskIdOrTask) {
  const s = getSettings();
  if (!s.pushEnabled || !sb.isConfigured()) return;
  const task = typeof taskIdOrTask === 'string' ? getTask(taskIdOrTask) : taskIdOrTask;
  if (!task) return;
  try {
    const when = computeReminderDateTime(task);
    const isDone = task.type === 'once' ? task.completed : false;
    if (!when || isDone || task.archived) {
      await sb.deleteReminderForTask(task.id);
      return;
    }
    await sb.upsertReminder({
      taskId: task.id,
      title: '⏰ ' + task.title,
      body: task.notes ? task.notes.slice(0, 120) : 'Tarea pendiente en Ritmo.',
      remindAt: when.toISOString(),
    });
  } catch (e) {
    console.warn('No se pudo sincronizar el recordatorio (¿sin conexión?):', e.message);
  }
}

export async function deleteTaskReminder(taskId) {
  if (!sb.isConfigured()) return;
  try { await sb.deleteReminderForTask(taskId); } catch (e) { /* sin conexión */ }
}
