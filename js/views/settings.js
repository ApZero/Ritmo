// ritmo/js/views/settings.js
import { el, toast } from '../ui.js';
import * as Store from '../store.js';
import * as Push from '../push.js';

export const fab = null;

export function render(container) {
  const s = Store.getSettings();

  container.appendChild(section('Preferencias generales', [
    fieldToggle('Ocultar completadas por defecto', s.hideCompletedDefault, v => Store.updateSettings({ hideCompletedDefault: v })),
    fieldNumber('Ventana de "próximo" (días)', s.proximoWindowDays, v => Store.updateSettings({ proximoWindowDays: v })),
  ]));

  container.appendChild(section('Clima y ubicación', [
    fieldToggle('Mostrar sugerencias de clima', s.weatherEnabled, v => Store.updateSettings({ weatherEnabled: v })),
    fieldText('Nombre del lugar', s.locationLabel, v => Store.updateSettings({ locationLabel: v })),
    fieldNumber('Latitud', s.lat, v => Store.updateSettings({ lat: v }), true),
    fieldNumber('Longitud', s.lon, v => Store.updateSettings({ lon: v }), true),
  ]));

  container.appendChild(buildNotificationSection(s));
  container.appendChild(buildBackupSection());
}

function section(title, fields) {
  return el('div', {}, [
    el('div', { class: 'section-label' }, title),
    el('div', { class: 'card', style: 'margin:0 14px 14px;' }, fields),
  ]);
}

function fieldToggle(label, value, onChange) {
  const row = el('div', { class: 'field', style: 'display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;' });
  row.appendChild(el('label', { style: 'margin:0;' }, label));
  const chip = el('button', { class: 'chip' + (value ? ' active' : '') }, value ? 'Sí' : 'No');
  chip.addEventListener('click', () => { const nv = !value; onChange(nv); chip.className = 'chip' + (nv ? ' active' : ''); chip.textContent = nv ? 'Sí' : 'No'; value = nv; });
  row.appendChild(chip);
  return row;
}

function fieldText(label, value, onChange) {
  const input = el('input', { type: 'text', value: value || '' });
  input.addEventListener('change', () => onChange(input.value));
  return el('div', { class: 'field' }, [el('label', {}, label), input]);
}

function fieldNumber(label, value, onChange, isFloat = false) {
  const input = el('input', { type: 'number', step: isFloat ? '0.0001' : '1', value });
  input.addEventListener('change', () => onChange(isFloat ? parseFloat(input.value) : Number(input.value)));
  return el('div', { class: 'field' }, [el('label', {}, label), input]);
}

function buildNotificationSection(s) {
  const wrap = el('div');
  wrap.appendChild(el('div', { class: 'section-label' }, 'Notificaciones push'));
  const card = el('div', { class: 'card', style: 'margin:0 14px 14px;' });

  card.appendChild(el('p', { style: 'font-size:12.5px;color:var(--ink-soft);margin:0 0 12px;' },
    'Para que los avisos lleguen aunque la app esté cerrada, necesitás tu propio proyecto de Supabase (gratis). Ver el archivo DEPLOY.md para la guía paso a paso.'));

  const urlInput = el('input', { type: 'text', placeholder: 'https://xxxx.supabase.co', value: s.supabaseUrl || '' });
  urlInput.addEventListener('change', () => Store.updateSettings({ supabaseUrl: urlInput.value.trim() }));
  card.appendChild(el('div', { class: 'field' }, [el('label', {}, 'Supabase URL'), urlInput]));

  const keyInput = el('input', { type: 'text', placeholder: 'clave anon pública', value: s.supabaseAnonKey || '' });
  keyInput.addEventListener('change', () => Store.updateSettings({ supabaseAnonKey: keyInput.value.trim() }));
  card.appendChild(el('div', { class: 'field' }, [el('label', {}, 'Supabase anon key'), keyInput]));

  const vapidInput = el('input', { type: 'text', placeholder: 'clave pública VAPID', value: s.vapidPublicKey || '' });
  vapidInput.addEventListener('change', () => Store.updateSettings({ vapidPublicKey: vapidInput.value.trim() }));
  card.appendChild(el('div', { class: 'field' }, [el('label', {}, 'Clave pública VAPID'), vapidInput]));

  const statusLine = el('div', { style: 'font-size:12.5px;color:var(--ink-soft);margin:4px 0 12px;' },
    `Permiso del navegador: ${Push.permissionState()} · Estado: ${s.pushEnabled ? 'activado ✅' : 'desactivado'}`);
  card.appendChild(statusLine);

  const btn = el('button', { class: 'btn ' + (s.pushEnabled ? 'btn-danger' : 'btn-primary') }, s.pushEnabled ? 'Desactivar notificaciones' : 'Activar notificaciones en este teléfono');
  btn.addEventListener('click', async () => {
    try {
      if (s.pushEnabled) { await Push.disablePush(); toast('Notificaciones desactivadas'); }
      else { await Push.enablePush(); toast('¡Notificaciones activadas!'); }
      refresh();
    } catch (e) { toast(e.message); }
  });
  card.appendChild(btn);
  wrap.appendChild(card);
  return wrap;
}

function buildBackupSection() {
  const wrap = el('div');
  wrap.appendChild(el('div', { class: 'section-label' }, 'Respaldo'));
  const card = el('div', { class: 'card', style: 'margin:0 14px 14px;' });

  const exportBtn = el('button', { class: 'btn btn-secondary', style: 'margin-bottom:10px;' }, '⬇️ Exportar respaldo (.json)');
  exportBtn.addEventListener('click', () => {
    const data = Store.exportBackup();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = el('a', { href: url, download: `ritmo-respaldo-${new Date().toISOString().slice(0, 10)}.json` });
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
    toast('Respaldo descargado');
  });
  card.appendChild(exportBtn);

  const fileInput = el('input', { type: 'file', accept: 'application/json', style: 'display:none;' });
  const importBtn = el('button', { class: 'btn btn-secondary' }, '⬆️ Importar respaldo');
  importBtn.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => {
    const file = fileInput.files[0];
    if (!file) return;
    const replace = confirm('¿Reemplazar todos los datos actuales con este respaldo?\nCancelar = combinar (agregar lo que falte, sin borrar lo actual).');
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const json = JSON.parse(reader.result);
        Store.importBackup(json, { replace });
        toast('Respaldo importado');
      } catch (e) { toast('No se pudo leer el archivo: ' + e.message); }
    };
    reader.readAsText(file);
  });
  card.appendChild(importBtn);
  card.appendChild(fileInput);
  wrap.appendChild(card);
  return wrap;
}

function refresh() {
  const v = document.getElementById('view');
  v.innerHTML = '';
  render(v);
}
