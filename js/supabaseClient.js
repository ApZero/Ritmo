// ritmo/js/supabaseClient.js
// Cliente mínimo de Supabase usando fetch crudo a la API REST (PostgREST),
// sin el SDK de Supabase — coherente con el resto de tus apps de una sola
// página. Solo se usa para sincronizar lo necesario para las notificaciones
// push (suscripción del dispositivo y recordatorios programados). El resto
// de los datos de la app permanece 100% local.

import { getSettings } from './store.js';

function isConfigured() {
  const s = getSettings();
  return !!(s.supabaseUrl && s.supabaseAnonKey);
}

async function rest(path, { method = 'GET', body, prefer } = {}) {
  const s = getSettings();
  if (!s.supabaseUrl || !s.supabaseAnonKey) throw new Error('Supabase no está configurado.');
  const headers = {
    'Content-Type': 'application/json',
    apikey: s.supabaseAnonKey,
    Authorization: `Bearer ${s.supabaseAnonKey}`,
  };
  if (prefer) headers.Prefer = prefer;
  const res = await fetch(`${s.supabaseUrl}/rest/v1/${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Supabase ${method} ${path} -> ${res.status}: ${text}`);
  }
  if (res.status === 204) return null;
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

/** Guarda o actualiza la suscripción push de este dispositivo. */
export async function upsertPushSubscription(deviceId, subscriptionJSON) {
  return rest('push_subscriptions?on_conflict=device_id', {
    method: 'POST',
    prefer: 'resolution=merge-duplicates,return=minimal',
    body: {
      device_id: deviceId,
      endpoint: subscriptionJSON.endpoint,
      p256dh: subscriptionJSON.keys.p256dh,
      auth: subscriptionJSON.keys.auth,
      updated_at: new Date().toISOString(),
    },
  });
}

export async function deletePushSubscription(deviceId) {
  return rest(`push_subscriptions?device_id=eq.${deviceId}`, { method: 'DELETE', prefer: 'return=minimal' });
}

/** Crea o reemplaza el recordatorio pendiente de una tarea (una fila por tarea). */
export async function upsertReminder({ taskId, title, body, remindAt }) {
  return rest('reminders?on_conflict=task_id', {
    method: 'POST',
    prefer: 'resolution=merge-duplicates,return=minimal',
    body: {
      task_id: taskId,
      title,
      body,
      remind_at: remindAt, // ISO 8601 con zona horaria
      sent: false,
    },
  });
}

export async function deleteReminderForTask(taskId) {
  return rest(`reminders?task_id=eq.${taskId}`, { method: 'DELETE', prefer: 'return=minimal' });
}

export { isConfigured };
