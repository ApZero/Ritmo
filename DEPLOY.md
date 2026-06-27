# Cómo publicar Ritmo

Esta guía cubre dos partes independientes:

1. **La app en sí** (GitHub Pages) — siempre necesario.
2. **Notificaciones push exactas** (Supabase) — opcional. Sin esto, la app funciona perfecto igual, solo que los recordatorios dependen de que abras la app.

---

## 1. Publicar la app en GitHub Pages

1. Creá un repositorio nuevo en GitHub (puede ser público o privado).
2. Subí **todo** el contenido de esta carpeta (`index.html`, `manifest.webmanifest`, `sw.js`, `css/`, `js/`, `icons/`) a la raíz del repo.
3. En el repo: **Settings → Pages → Source** → elegí la rama `main` y carpeta `/ (root)`. Guardá.
4. Esperá un minuto y entrá a `https://TU-USUARIO.github.io/TU-REPO/`.
5. Desde el celular (Chrome), abrí esa URL y tocá **"Agregar a pantalla de inicio"** / **"Instalar app"**.

Listo — la app ya funciona, con datos guardados localmente en el teléfono, y podés exportar/importar respaldos desde Ajustes.

> Importante: como es una PWA bajo una subruta (`/TU-REPO/`), todos los archivos usan rutas relativas (`./`), así que funciona sin tocar nada. Si usás un dominio propio, también funciona igual.

---

## 2. Notificaciones push exactas (opcional)

Esto hace que los recordatorios lleguen como notificación real de Android, incluso con la app cerrada y el teléfono bloqueado.

### 2.1 Crear el proyecto de Supabase

1. Entrá a [supabase.com](https://supabase.com) y creá un proyecto nuevo (gratis).
2. En **SQL Editor**, pegá y ejecutá el contenido de `supabase/schema.sql` (crea las dos tablas necesarias y habilita las extensiones `pg_cron`/`pg_net`).
3. En **Settings → API**, copiá:
   - **Project URL** → va en Ajustes → "Supabase URL" dentro de la app.
   - **anon public key** → va en Ajustes → "Supabase anon key" dentro de la app.

### 2.2 Tus claves VAPID

Ya generé un par de claves para que no tengas que instalar nada. **Guardalas, no se pueden recuperar después:**

```
VAPID_PUBLIC_KEY  = BHFvNpGS9c8pxPtDpFQXA7ioZ1NEEBemTv-k2MjxTpu_IN0jkte7KyVKwQejpKbRCByWVp5UgHQLd8XOtXoVD3U
VAPID_PRIVATE_KEY = eORM6OmFLRpD_yMiiEOjThNvBhLsgbJE8qR0vpDerv8
```

- La **pública** va en Ajustes → "Clave pública VAPID" dentro de la app (no es secreta).
- La **privada** va como secreto de Supabase (nunca en el código del cliente) — ver paso siguiente.

Si en algún momento querés generar tu propio par en lugar de usar este, cualquier herramienta que genere claves VAPID (formato Web Push estándar) sirve.

### 2.3 Desplegar la función de envío

Necesitás el [CLI de Supabase](https://supabase.com/docs/guides/cli) instalado en tu computadora (no en el teléfono).

```bash
npm install -g supabase
supabase login
cd ritmo                       # esta carpeta
supabase link --project-ref TU-PROJECT-REF      # lo ves en la URL del dashboard
supabase functions deploy send-reminders

supabase secrets set VAPID_PUBLIC_KEY=BHFvNpGS9c8pxPtDpFQXA7ioZ1NEEBemTv-k2MjxTpu_IN0jkte7KyVKwQejpKbRCByWVp5UgHQLd8XOtXoVD3U
supabase secrets set VAPID_PRIVATE_KEY=eORM6OmFLRpD_yMiiEOjThNvBhLsgbJE8qR0vpDerv8
supabase secrets set VAPID_SUBJECT=mailto:tu-correo@ejemplo.com
```

(`SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` ya están disponibles automáticamente dentro de la función, no hace falta configurarlos.)

### 2.4 Programar la función cada 5 minutos

En el **SQL Editor** de Supabase, reemplazá `TU-PROJECT-REF` y `TU-SERVICE-ROLE-KEY` (Settings → API → service_role) y ejecutá:

```sql
select cron.schedule(
  'enviar-recordatorios-ritmo',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://TU-PROJECT-REF.functions.supabase.co/send-reminders',
    headers := jsonb_build_object(
      'Authorization', 'Bearer TU-SERVICE-ROLE-KEY',
      'Content-Type', 'application/json'
    )
  );
  $$
);
```

> Nota de seguridad: esto guarda tu service_role key dentro de `cron.job`, visible solo para vos como administrador del proyecto. Para más seguridad podés guardarla en Supabase Vault en su lugar — el propio Supabase lo recomienda así, ver su guía de "Schedule Edge Functions".

Podés revisar que corra con:
```sql
select * from cron.job_run_details order by start_time desc limit 5;
```

### 2.5 Activar en el teléfono

1. Abrí la app instalada → Ajustes → completá Supabase URL, anon key y clave VAPID pública (si no las cargaste antes).
2. Tocá **"Activar notificaciones en este teléfono"** y aceptá el permiso.
3. Editá cualquier tarea, activá su "Recordatorio" con una hora cercana (ej. 2 minutos desde ahora) y guardá.
4. Esperá un máximo de 5 minutos (el ciclo del cron) — debería llegar la notificación incluso con la app cerrada.

### Sobre la privacidad de este mecanismo

Para que un servidor pueda avisarte en el momento exacto, ese servidor necesita saber **qué** avisar y **cuándo** — eso es lo único que sale de tu teléfono hacia Supabase (título, una descripción corta, y la fecha/hora). El resto de tus datos (todas las tareas, proyectos, comentarios, categorías, historial) se queda 100% local en el navegador, igual que siempre.

---

## Variables que podés cambiar

- **Categorías iniciales**, paleta de colores, coordenadas de clima por defecto: en `js/store.js` (`defaultData()`) y en Ajustes dentro de la app.
- **Nombre/colores del ícono**: regenerá los PNG en `icons/` si querés otro diseño.
