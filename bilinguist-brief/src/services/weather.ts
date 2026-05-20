import * as Location from 'expo-location';
import type { LanguageCode } from '../store/useSettingsStore';

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

const OWM_LANG: Record<LanguageCode, string> = {
  en: 'en',
  fr: 'fr',
  de: 'de',
  es: 'es',
  it: 'it',
};

function timeOfDay(): 'morning' | 'afternoon' | 'evening' {
  const h = new Date().getHours();
  if (h < 12) return 'morning';
  if (h < 18) return 'afternoon';
  return 'evening';
}

export async function fetchWeather(language: LanguageCode): Promise<WeatherData | null> {
  try {
    const apiKey = process.env.EXPO_PUBLIC_OPENWEATHER_API_KEY;
    if (!apiKey) return null;

    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return null;

    const location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low });
    const { latitude, longitude } = location.coords;

    const lang = OWM_LANG[language] ?? 'en';
    const url = `https://api.openweathermap.org/data/2.5/weather?lat=${latitude}&lon=${longitude}&appid=${apiKey}&units=metric&lang=${lang}`;

    const res = await fetch(url);
    if (!res.ok) return null;

    const data = await res.json();

    const temp = Math.round(data.main?.temp ?? 0);
    const description = data.weather?.[0]?.description ?? '';
    const city = data.name ?? '';
    const greeting = GREETINGS[language]?.[timeOfDay()] ?? 'Good morning';

    return { temp, description, city, greeting };
  } catch {
    return null;
  }
}
