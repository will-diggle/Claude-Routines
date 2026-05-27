import type { LanguageCode } from '../store/useSettingsStore';

export interface WeatherData {
  temp: number;
  description: string;
  city: string;
  greeting: string;
  feelsLike: number;
  humidity: number;
  windKph: number;
  uvIndex: number;
  code: number;
}

const GREETINGS: Partial<Record<LanguageCode, Record<'morning' | 'afternoon' | 'evening', string>>> = {
  en: { morning: 'Good morning', afternoon: 'Good afternoon', evening: 'Good evening' },
  fr: { morning: 'Bonjour', afternoon: 'Bon après-midi', evening: 'Bonsoir' },
  de: { morning: 'Guten Morgen', afternoon: 'Guten Tag', evening: 'Guten Abend' },
  sv: { morning: 'God morgon', afternoon: 'God dag', evening: 'God kväll' },
};

const LANG_CITIES: Partial<Record<LanguageCode, { latitude: number; longitude: number; name: string }>> = {
  en: { latitude: 51.5074, longitude: -0.1278, name: 'London' },
  fr: { latitude: 48.8566, longitude:  2.3522, name: 'Paris'  },
  de: { latitude: 52.5200, longitude: 13.4050, name: 'Berlin' },
  sv: { latitude: 59.3293, longitude: 18.0686, name: 'Stockholm' },
};

// Fallback city if language not in LANG_CITIES
const FALLBACK_CITY = { latitude: 51.5074, longitude: -0.1278, name: 'London' };

// WMO weather interpretation codes → English description
// https://open-meteo.com/en/docs#weathervariables
const WMO_DESCRIPTIONS: Record<number, string> = {
  0: 'clear sky',
  1: 'mainly clear', 2: 'partly cloudy', 3: 'overcast',
  45: 'fog', 48: 'depositing rime fog',
  51: 'light drizzle', 53: 'drizzle', 55: 'heavy drizzle',
  61: 'light rain', 63: 'rain', 65: 'heavy rain',
  71: 'light snow', 73: 'snow', 75: 'heavy snow', 77: 'snow grains',
  80: 'rain showers', 81: 'showers', 82: 'heavy showers',
  85: 'snow showers', 86: 'heavy snow showers',
  95: 'thunderstorm', 96: 'thunderstorm with hail', 99: 'thunderstorm with heavy hail',
};

function timeOfDay(): 'morning' | 'afternoon' | 'evening' {
  const h = new Date().getHours();
  if (h < 12) return 'morning';
  if (h < 18) return 'afternoon';
  return 'evening';
}


export async function fetchWeather(language: LanguageCode): Promise<WeatherData | null> {
  try {
    const cityData = LANG_CITIES[language] ?? FALLBACK_CITY;
    const { latitude, longitude, name: city } = cityData;

    // Open-Meteo — free, no API key required
    const url =
      `https://api.open-meteo.com/v1/forecast` +
      `?latitude=${latitude}&longitude=${longitude}` +
      `&current=temperature_2m,weather_code,apparent_temperature,relative_humidity_2m,wind_speed_10m,uv_index` +
      `&temperature_unit=celsius` +
      `&wind_speed_unit=kmh`;

    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();

    const temp = Math.round(data.current?.temperature_2m ?? 0);
    const code: number = data.current?.weather_code ?? 0;
    const description = WMO_DESCRIPTIONS[code] ?? 'clear sky';
    const greeting = GREETINGS[language]?.[timeOfDay()] ?? 'Good morning';
    const feelsLike = Math.round(data.current?.apparent_temperature ?? temp);
    const humidity = Math.round(data.current?.relative_humidity_2m ?? 0);
    const windKph = Math.round(data.current?.wind_speed_10m ?? 0);
    const uvIndex = Math.round(data.current?.uv_index ?? 0);

    return { temp, description, city, greeting, feelsLike, humidity, windKph, uvIndex, code };
  } catch {
    return null;
  }
}
