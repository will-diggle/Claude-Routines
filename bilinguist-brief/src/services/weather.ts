import type { LanguageCode } from '../store/useSettingsStore';

// Hardcoded to London until per-user location is added
const LONDON = { latitude: 51.5074, longitude: -0.1278 };

export interface WeatherData {
  temp: number;
  description: string;
  city: string;
  greeting: string;
}

const GREETINGS: Record<LanguageCode, Record<'morning' | 'afternoon' | 'evening', string>> = {
  en: { morning: 'Good morning', afternoon: 'Good afternoon', evening: 'Good evening' },
  fr: { morning: 'Bonjour', afternoon: 'Bon après-midi', evening: 'Bonsoir' },
  de: { morning: 'Guten Morgen', afternoon: 'Guten Tag', evening: 'Guten Abend' },
  es: { morning: 'Buenos días', afternoon: 'Buenas tardes', evening: 'Buenas noches' },
  it: { morning: 'Buongiorno', afternoon: 'Buon pomeriggio', evening: 'Buonasera' },
};

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
    const { latitude, longitude } = LONDON;

    // Open-Meteo — free, no API key required
    const url =
      `https://api.open-meteo.com/v1/forecast` +
      `?latitude=${latitude}&longitude=${longitude}` +
      `&current=temperature_2m,weather_code` +
      `&temperature_unit=celsius`;

    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();

    const temp = Math.round(data.current?.temperature_2m ?? 0);
    const code: number = data.current?.weather_code ?? 0;
    const description = WMO_DESCRIPTIONS[code] ?? 'clear sky';
    const city = 'London';
    const greeting = GREETINGS[language]?.[timeOfDay()] ?? 'Good morning';

    return { temp, description, city, greeting };
  } catch {
    return null;
  }
}
