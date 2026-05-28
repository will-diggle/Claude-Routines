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
  en: { morning: 'Good morning',   afternoon: 'Good afternoon',  evening: 'Good evening'  },
  fr: { morning: 'Bonjour',        afternoon: 'Bon après-midi',  evening: 'Bonsoir'        },
  de: { morning: 'Guten Morgen',   afternoon: 'Guten Tag',       evening: 'Guten Abend'   },
  sv: { morning: 'God morgon',     afternoon: 'God dag',         evening: 'God kväll'     },
  it: { morning: 'Buongiorno',     afternoon: 'Buon pomeriggio', evening: 'Buonasera'     },
  es: { morning: 'Buenos días',    afternoon: 'Buenas tardes',   evening: 'Buenas noches' },
};

const LANG_CITIES: Partial<Record<LanguageCode, { latitude: number; longitude: number; name: string }>> = {
  en: { latitude: 51.5074, longitude: -0.1278, name: 'London'    },
  fr: { latitude: 48.8566, longitude:  2.3522, name: 'Paris'     },
  de: { latitude: 52.5200, longitude: 13.4050, name: 'Berlin'    },
  sv: { latitude: 59.3293, longitude: 18.0686, name: 'Stockholm' },
  it: { latitude: 41.9028, longitude: 12.4964, name: 'Rome'      },
  es: { latitude: 40.4168, longitude: -3.7038, name: 'Madrid'    },
};

const FALLBACK_CITY = { latitude: 51.5074, longitude: -0.1278, name: 'London' };

// WMO weather interpretation codes — one map per supported language
// https://open-meteo.com/en/docs#weathervariables
const WMO: Record<string, Record<number, string>> = {
  en: {
    0: 'clear sky',
    1: 'mainly clear', 2: 'partly cloudy', 3: 'overcast',
    45: 'fog', 48: 'rime fog',
    51: 'light drizzle', 53: 'drizzle', 55: 'heavy drizzle',
    61: 'light rain', 63: 'rain', 65: 'heavy rain',
    71: 'light snow', 73: 'snow', 75: 'heavy snow', 77: 'snow grains',
    80: 'light showers', 81: 'showers', 82: 'heavy showers',
    85: 'snow showers', 86: 'heavy snow showers',
    95: 'thunderstorm', 96: 'thunderstorm with hail', 99: 'thunderstorm with heavy hail',
  },
  fr: {
    0: 'ciel dégagé',
    1: 'principalement dégagé', 2: 'partiellement nuageux', 3: 'couvert',
    45: 'brouillard', 48: 'brouillard givrant',
    51: 'bruine légère', 53: 'bruine', 55: 'bruine dense',
    61: 'pluie légère', 63: 'pluie', 65: 'forte pluie',
    71: 'neige légère', 73: 'neige', 75: 'forte neige', 77: 'grains de neige',
    80: 'averses légères', 81: 'averses', 82: 'fortes averses',
    85: 'averses de neige', 86: 'fortes averses de neige',
    95: 'orage', 96: 'orage avec grêle', 99: 'orage avec forte grêle',
  },
  de: {
    0: 'klarer Himmel',
    1: 'überwiegend klar', 2: 'teilweise bewölkt', 3: 'bedeckt',
    45: 'Nebel', 48: 'gefrierender Nebel',
    51: 'leichter Nieselregen', 53: 'Nieselregen', 55: 'starker Nieselregen',
    61: 'leichter Regen', 63: 'Regen', 65: 'starker Regen',
    71: 'leichter Schnee', 73: 'Schnee', 75: 'starker Schnee', 77: 'Schneekörner',
    80: 'leichte Schauer', 81: 'Schauer', 82: 'starke Schauer',
    85: 'Schneeschauer', 86: 'starke Schneeschauer',
    95: 'Gewitter', 96: 'Gewitter mit Hagel', 99: 'Gewitter mit starkem Hagel',
  },
  sv: {
    0: 'klar himmel',
    1: 'mestadels klart', 2: 'delvis molnigt', 3: 'mulet',
    45: 'dimma', 48: 'underkyld dimma',
    51: 'lätt duggregn', 53: 'duggregn', 55: 'kraftigt duggregn',
    61: 'lätt regn', 63: 'regn', 65: 'kraftigt regn',
    71: 'lätt snöfall', 73: 'snö', 75: 'kraftigt snöfall', 77: 'snögryn',
    80: 'lätta skurar', 81: 'regnskurar', 82: 'kraftiga regnskurar',
    85: 'snöbyar', 86: 'kraftiga snöbyar',
    95: 'åskväder', 96: 'åskväder med hagel', 99: 'åskväder med kraftigt hagel',
  },
  it: {
    0: 'cielo sereno',
    1: 'prevalentemente sereno', 2: 'parzialmente nuvoloso', 3: 'coperto',
    45: 'nebbia', 48: 'nebbia gelata',
    51: 'pioggerella leggera', 53: 'pioggerella', 55: 'pioggerella intensa',
    61: 'pioggia leggera', 63: 'pioggia', 65: 'pioggia intensa',
    71: 'neve leggera', 73: 'neve', 75: 'neve intensa', 77: 'granelli di neve',
    80: 'rovesci leggeri', 81: 'rovesci', 82: 'rovesci intensi',
    85: 'rovesci di neve', 86: 'rovesci di neve intensa',
    95: 'temporale', 96: 'temporale con grandine', 99: 'temporale con grandine intensa',
  },
  es: {
    0: 'cielo despejado',
    1: 'principalmente despejado', 2: 'parcialmente nublado', 3: 'nublado',
    45: 'niebla', 48: 'niebla helada',
    51: 'llovizna ligera', 53: 'llovizna', 55: 'llovizna intensa',
    61: 'lluvia ligera', 63: 'lluvia', 65: 'lluvia intensa',
    71: 'nieve ligera', 73: 'nieve', 75: 'nieve intensa', 77: 'granizo de nieve',
    80: 'chubascos ligeros', 81: 'chubascos', 82: 'chubascos intensos',
    85: 'chubascos de nieve', 86: 'chubascos de nieve intensa',
    95: 'tormenta', 96: 'tormenta con granizo', 99: 'tormenta con granizo intenso',
  },
};

// "in [city]" preposition per language
export const WEATHER_IN: Partial<Record<LanguageCode, string>> = {
  en: 'in', fr: 'à', de: 'in', sv: 'i', it: 'a', es: 'en',
};

function timeOfDay(): 'morning' | 'afternoon' | 'evening' {
  const h = new Date().getHours();
  if (h < 12) return 'morning';
  if (h < 18) return 'afternoon';
  return 'evening';
}

export async function fetchWeather(
  language: LanguageCode,
  userCoords?: { latitude: number; longitude: number; cityName?: string },
): Promise<WeatherData | null> {
  try {
    let latitude: number;
    let longitude: number;
    let city: string;

    if (userCoords) {
      ({ latitude, longitude } = userCoords);
      city = userCoords.cityName ?? 'My Location';
    } else {
      const cityData = LANG_CITIES[language] ?? FALLBACK_CITY;
      latitude = cityData.latitude;
      longitude = cityData.longitude;
      city = cityData.name;
    }

    const url =
      `https://api.open-meteo.com/v1/forecast` +
      `?latitude=${latitude}&longitude=${longitude}` +
      `&current=temperature_2m,weather_code,apparent_temperature,relative_humidity_2m,wind_speed_10m,uv_index` +
      `&temperature_unit=celsius&wind_speed_unit=kmh`;

    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();

    const temp         = Math.round(data.current?.temperature_2m ?? 0);
    const code: number = data.current?.weather_code ?? 0;
    const langMap      = WMO[language] ?? WMO.en;
    const description  = langMap[code] ?? WMO.en[code] ?? 'clear sky';
    const greeting     = GREETINGS[language]?.[timeOfDay()] ?? 'Good morning';
    const feelsLike    = Math.round(data.current?.apparent_temperature ?? temp);
    const humidity     = Math.round(data.current?.relative_humidity_2m ?? 0);
    const windKph      = Math.round(data.current?.wind_speed_10m ?? 0);
    const uvIndex      = Math.round(data.current?.uv_index ?? 0);

    return { temp, description, city, greeting, feelsLike, humidity, windKph, uvIndex, code };
  } catch {
    return null;
  }
}
