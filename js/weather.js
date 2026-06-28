// ritmo/js/weather.js
// Clima vía Open-Meteo (sin API key): hoy en detalle para la sugerencia del
// dashboard, y un pronóstico corto de los próximos días. Son heurísticas
// simples, no un pronóstico preciso — se muestran como sugerencia liviana,
// no como certeza.

import { getSettings } from './store.js';

const CACHE_KEY = 'ritmo:weather-cache';
const CACHE_MS = 30 * 60 * 1000; // 30 minutos
const FORECAST_DAYS = 5;

// Códigos WMO (los que usa Open-Meteo) agrupados a un emoji simple.
export function weatherEmoji(code) {
  if (code === 0) return '☀️';
  if (code === 1 || code === 2) return '🌤️';
  if (code === 3) return '☁️';
  if (code === 45 || code === 48) return '🌫️';
  if ([51, 53, 55, 56, 57].includes(code)) return '🌦️';
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return '🌧️';
  if ([71, 73, 75, 77].includes(code)) return '❄️';
  if ([95, 96, 99].includes(code)) return '⛈️';
  return '🌤️';
}

export async function fetchForecast() {
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
    `&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,wind_speed_10m_max,weathercode` +
    `&timezone=auto&forecast_days=${FORECAST_DAYS}`;

  const res = await fetch(url);
  if (!res.ok) throw new Error('No se pudo obtener el clima.');
  const json = await res.json();

  const days = (json.daily?.time || []).map((date, i) => ({
    date,
    tempMax: json.daily.temperature_2m_max?.[i],
    tempMin: json.daily.temperature_2m_min?.[i],
    precipProbMax: json.daily.precipitation_probability_max?.[i],
    precipSum: json.daily.precipitation_sum?.[i],
    windMax: json.daily.wind_speed_10m_max?.[i],
    code: json.daily.weathercode?.[i],
  }));

  const data = {
    current: {
      temp: json.current?.temperature_2m,
      humidity: json.current?.relative_humidity_2m,
      precip: json.current?.precipitation,
      wind: json.current?.wind_speed_10m,
    },
    days,
  };
  sessionStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), data }));
  return data;
}

/** Convierte el clima de hoy en una sugerencia liviana para el dashboard. */
export function buildSuggestion(forecast) {
  if (!forecast || !forecast.days?.length) return null;
  const today = forecast.days[0];
  const current = forecast.current;
  const rainy = (today.precipProbMax ?? 0) >= 45 || (current?.precip ?? 0) > 0.2;
  const veryHot = (today.tempMax ?? 0) >= 36;
  const windyForLaundry = (today.windMax ?? 0) >= 35;
  const goodForLaundry = !rainy && (today.precipProbMax ?? 0) < 25 && (current?.humidity ?? 100) < 70 && !windyForLaundry;

  let summary;
  if (rainy) summary = 'Buena chance de lluvia — priorizá tareas de adentro.';
  else if (veryHot) summary = 'Va a estar muy caluroso — mejor de adentro al mediodía.';
  else summary = 'Buen día para tareas al aire libre.';

  return {
    today, current, days: forecast.days,
    rainy, veryHot, goodForLaundry,
    summary,
    laundryNote: goodForLaundry ? 'Buen día para tender ropa.' : (rainy ? 'No tiendas ropa hoy.' : 'Poco favorable para tender ropa.'),
  };
}

export async function getTodaySuggestion() {
  try {
    const forecast = await fetchForecast();
    return buildSuggestion(forecast);
  } catch (e) {
    console.warn('Clima no disponible:', e.message);
    return null;
  }
}
