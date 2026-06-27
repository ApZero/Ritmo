# Ritmo

Tareas, rutinas recurrentes y proyectos — todo guardado localmente en tu teléfono.
PWA instalable, sin build step, pensada para GitHub Pages.

## Qué tiene

- **Tareas sueltas**: título, fecha opcional, prioridad, subtareas, etiquetas, categoría.
- **Tareas recurrentes**, con dos modos:
  - **Cada** (fecha fija): se repite en fechas exactas sin importar cuándo la completaste (ej. "cada lunes y jueves", "el último viernes de cada mes", "cada 3 meses el día 15").
  - **Después de** (depende de la última vez): la próxima fecha se calcula desde el día que la completaste (ej. "cada 10 días después de regar las plantas").
  - Comentario libre para la próxima vuelta (útil en tareas genéricas como "ordenar la cocina").
  - Se puede completar antes de tiempo, posponer, o deshacer la última finalización.
- **Vencido / Hoy / Próximo / A tiempo**, con cuenta regresiva legible en cada tarjeta.
- **Calendario** con el historial de finalizaciones (filtrable por tarea) y **Estadísticas**: rachas, % de cumplimiento a tiempo, tiempo invertido por categoría.
- **Proyectos** con pasos y subpasos a cualquier nivel de profundidad, con % de avance calculado automáticamente.
- **Categorías** editables con color, ícono y tiempo estimado por defecto.
- **Dashboard** con sugerencia según el clima de Filadelfia, Chaco (Open-Meteo): si conviene salir, quedarse adentro, o tender ropa.
- **Notificaciones push reales** en Android (opcional, requiere un proyecto gratuito de Supabase — ver `DEPLOY.md`).
- **Respaldo**: exportar/importar todos los datos como un archivo `.json`.

## Empezar

Ver `DEPLOY.md` para publicarlo en GitHub Pages (5 minutos) y, opcionalmente, activar notificaciones push exactas (15-20 minutos, una sola vez).

## Estructura

```
index.html            shell de la app
manifest.webmanifest   PWA instalable
sw.js                  service worker (offline + push)
css/styles.css         diseño
js/recurrence.js        motor de fechas recurrentes (puro, sin UI)
js/store.js             datos en localStorage + respaldo
js/weather.js           sugerencia de clima (Open-Meteo)
js/push.js               suscripción push + recordatorios
js/supabaseClient.js    cliente REST minimo (sin SDK)
js/views/*              cada pantalla de la app
supabase/               esquema SQL + función de envío de notificaciones
```
