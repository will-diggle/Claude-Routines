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
  latitude: number;
  longitude: number;
  // Hourly forecast for today (index = hour 0-23 local time)
  hourlyTemps?: number[];
  hourlyWinds?: number[];
  hourlyClouds?: number[];
}

export interface RainviewerFrame {
  time: number;  // unix seconds
  path: string;  // tile path fragment from RainViewer API
}

export async function fetchRainviewerFrames(): Promise<RainviewerFrame[]> {
  try {
    const res = await fetch('https://api.rainviewer.com/public/weather-maps.json');
    if (!res.ok) return [];
    const data = await res.json();
    const past     = (data.radar?.past    ?? []) as Array<{ time: number; path: string }>;
    const nowcast  = (data.radar?.nowcast ?? []) as Array<{ time: number; path: string }>;
    return [...past, ...nowcast].map(f => ({ time: f.time, path: f.path }));
  } catch {
    return [];
  }
}

const GREETINGS: Partial<Record<LanguageCode, Record<'morning' | 'afternoon' | 'evening', string>>> = {
  en: { morning: 'Good morning',   afternoon: 'Good afternoon',  evening: 'Good evening'  },
  fr: { morning: 'Bonjour',        afternoon: 'Bon après-midi',  evening: 'Bonsoir'        },
  de: { morning: 'Guten Morgen',   afternoon: 'Guten Tag',       evening: 'Guten Abend'   },
  sv: { morning: 'God morgon',     afternoon: 'God dag',         evening: 'God kväll'     },
  it: { morning: 'Buongiorno',     afternoon: 'Buon pomeriggio', evening: 'Buonasera'     },
  es: { morning: 'Buenos días',    afternoon: 'Buenas tardes',   evening: 'Buenas noches' },
  tr: { morning: 'Günaydın',       afternoon: 'İyi günler',      evening: 'İyi akşamlar'  },
  hu: { morning: 'Jó reggelt',     afternoon: 'Jó napot',        evening: 'Jó estét'      },
  ar: { morning: 'صباح الخير',    afternoon: 'مساء الخير',      evening: 'مساء النور'    },
};

const LANG_CITIES: Partial<Record<LanguageCode, { latitude: number; longitude: number; name: string }>> = {
  en: { latitude: 51.5074, longitude: -0.1278, name: 'London'    },
  fr: { latitude: 48.8566, longitude:  2.3522, name: 'Paris'     },
  de: { latitude: 52.5200, longitude: 13.4050, name: 'Berlin'    },
  sv: { latitude: 59.3293, longitude: 18.0686, name: 'Stockholm' },
  it: { latitude: 41.9028, longitude: 12.4964, name: 'Rome'      },
  es: { latitude: 40.4168, longitude: -3.7038, name: 'Madrid'    },
  tr: { latitude: 39.9334, longitude: 32.8597, name: 'Ankara'    },
  hu: { latitude: 47.4979, longitude: 19.0402, name: 'Budapest'  },
  ar: { latitude: 24.6877, longitude: 46.7219, name: 'الرياض'   },
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
  tr: {
    0: 'açık hava',
    1: 'çoğunlukla açık', 2: 'parçalı bulutlu', 3: 'kapalı',
    45: 'sis', 48: 'kırağılı sis',
    51: 'hafif çisenti', 53: 'çisenti', 55: 'yoğun çisenti',
    61: 'hafif yağmur', 63: 'yağmur', 65: 'şiddetli yağmur',
    71: 'hafif kar', 73: 'kar', 75: 'yoğun kar', 77: 'kar taneleri',
    80: 'hafif sağanak', 81: 'sağanak', 82: 'şiddetli sağanak',
    85: 'kar sağanağı', 86: 'yoğun kar sağanağı',
    95: 'gök gürültülü fırtına', 96: 'dolu ile fırtına', 99: 'yoğun dolu ile fırtına',
  },
  hu: {
    0: 'derült ég',
    1: 'többnyire derült', 2: 'részben felhős', 3: 'borult',
    45: 'köd', 48: 'zúzmarás köd',
    51: 'enyhe szitálás', 53: 'szitálás', 55: 'sűrű szitálás',
    61: 'enyhe eső', 63: 'eső', 65: 'erős eső',
    71: 'enyhe havazás', 73: 'havazás', 75: 'erős havazás', 77: 'hószemcsék',
    80: 'enyhe zápor', 81: 'zápor', 82: 'erős zápor',
    85: 'hózápor', 86: 'erős hózápor',
    95: 'zivatar', 96: 'zivatarjégesővel', 99: 'erős zivatarjégesővel',
  },
  ar: {
    0: 'سماء صافية',
    1: 'صافٍ في معظمه', 2: 'غائم جزئياً', 3: 'غائم',
    45: 'ضباب', 48: 'ضباب متجمد',
    51: 'رذاذ خفيف', 53: 'رذاذ', 55: 'رذاذ كثيف',
    61: 'مطر خفيف', 63: 'مطر', 65: 'مطر غزير',
    71: 'ثلج خفيف', 73: 'ثلج', 75: 'ثلج كثيف', 77: 'حبيبات ثلجية',
    80: 'زخات خفيفة', 81: 'زخات مطر', 82: 'زخات قوية',
    85: 'زخات ثلجية', 86: 'زخات ثلجية قوية',
    95: 'عاصفة رعدية', 96: 'عاصفة رعدية مع برَد', 99: 'عاصفة رعدية مع برَد قوي',
  },
};

// "in [city]" preposition per language
export const WEATHER_IN: Partial<Record<LanguageCode, string>> = {
  en: 'in', fr: 'à', de: 'in', sv: 'i', it: 'a', es: 'en', tr: 'şehrinde', hu: 'városban', ar: 'في',
};

// Cache localized city names for the session to avoid repeated Nominatim calls
const _cityCache: Partial<Record<string, string>> = {};

async function getCityInLanguage(
  lat: number,
  lon: number,
  lang: LanguageCode,
): Promise<string> {
  const key = `${lat.toFixed(3)},${lon.toFixed(3)},${lang}`;
  if (_cityCache[key]) return _cityCache[key]!;

  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&accept-language=${lang}&zoom=10`,
      { headers: { 'User-Agent': 'BilinguistBriefApp/1.0' } },
    );
    if (!res.ok) return 'My Location';
    const data = await res.json();
    const name: string =
      data.address?.city ??
      data.address?.town ??
      data.address?.village ??
      data.address?.municipality ??
      data.name ??
      'My Location';
    _cityCache[key] = name;
    return name;
  } catch {
    return 'My Location';
  }
}

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
      city = await getCityInLanguage(latitude, longitude, language);
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
      `&hourly=temperature_2m,wind_speed_10m,cloudcover` +
      `&forecast_days=1&timezone=auto` +
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

    const hourlyRaw   = data.hourly ?? {};
    const hourlyTemps = ((hourlyRaw.temperature_2m as number[]) ?? []).slice(0, 24).map(Math.round);
    const hourlyWinds = ((hourlyRaw.wind_speed_10m as number[]) ?? []).slice(0, 24).map(Math.round);
    const hourlyClouds = ((hourlyRaw.cloudcover as number[]) ?? []).slice(0, 24).map(Math.round);

    return { temp, description, city, greeting, feelsLike, humidity, windKph, uvIndex, code, latitude, longitude, hourlyTemps, hourlyWinds, hourlyClouds };
  } catch {
    return null;
  }
}
