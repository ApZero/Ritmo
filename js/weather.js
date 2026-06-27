// ritmo/js/weather.js
// Clima del día vía Open-Meteo (sin API key) para sugerir en el dashboard si
// conviene salir, quedarse adentro, o tender la ropa. Son heurísticas simples,
// no un pronóstico preciso — se muestran como sugerencia, no como certeza.

import { getSettings } from './store.js';

const CACHE_KEY = 'ritmo:weather-cache';
const CACHE_MS = 30 * 60 * 1000; // 30 minutos

export async function fetchToday() {
  const s = getSettings();
  if (!s.weatherEnabled) return null;

  const cached = sessionStorage.getItem(CACHE_KEY);
  if (cached) {
    try {
      const { ts, data } = JSON.parse(cached);
      if (Date.now() - ts < CACHE_MS) return data;
    } catch (e) { /* cache corrupto, seguimos */ }
  }

  const url = `https://api.open-meteo.com/v1/forecast?latitude=${s.lat}&longitude=${s.lon}` +
    `&current=temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m` +
    `&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,wind_speed_10m_max` +
    `&timezone=auto&forecast_days=1`;

  const res = await fetch(url);
  if (!res.ok) throw new Error('No se pudo obtener el clima.');
  const json = await res.json();

  const data = {
    tempNow: json.current?.temperature_2m,
    humidityNow: json.current?.relative_humidity_2m,
    precipNow: json.current?.precipitation,
    windNow: json.current?.wind_speed_10m,
    tempMax: json.daily?.temperature_2m_max?.[0],
    tempMin: json.daily?.temperature_2m_min?.[0],
    precipProbMax: json.daily?.precipitation_probability_max?.[0],
    precipSum: json.daily?.precipitation_sum?.[0],
    windMax: json.daily?.wind_speed_10m_max?.[0],
  };
  sessionStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), data }));
  return data;
}

/** Convierte el clima crudo en sugerencias para el dashboard. */
export function buildSuggestion(w) {
  if (!w) return null;
  const rainy = (w.precipProbMax ?? 0) >= 45 || (w.precipNow ?? 0) > 0.2;
  const veryHot = (w.tempMax ?? 0) >= 36;
  const windyForLaundry = (w.windMax ?? 0) >= 35;
  const goodForLaundry = !rainy && (w.precipProbMax ?? 0) < 25 && (w.humidityNow ?? 100) < 70 && !windyForLaundry;
  const goodToBeOutside = !rainy;

  let summary;
  if (rainy) summary = 'Hay buena chance de lluvia hoy — mejor priorizar tareas de adentro.';
  else if (veryHot) summary = 'Va a estar muy caluroso — ideal para tareas de adentro al mediodía, y de afuera temprano o al atardecer.';
  else summary = 'Buen día para tareas al aire libre.';

  return {
    raw: w,
    rainy,
    veryHot,
    goodForLaundry,
    goodToBeOutside,
    summary,
    laundryNote: goodForLaundry
      ? 'Buen día para tender ropa.'
      : (rainy ? 'No tiendas ropa hoy, hay chance de lluvia.' : 'Humedad alta o poco viento — la ropa tardará en secar.'),
  };
}

export async function getTodaySuggestion() {
  try {
    const w = await fetchToday();
    return buildSuggestion(w);
  } catch (e) {
    console.warn('Clima no disponible:', e.message);
    return null;
  }
}
