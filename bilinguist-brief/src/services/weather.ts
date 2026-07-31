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
  utcOffsetSeconds?: number; // location's UTC offset, for computing local hour
  // Hourly forecast for today (index = hour 0-23 local time)
  hourlyTemps?: number[];
  hourlyWinds?: number[];
  hourlyClouds?: number[];
  hourlyPrecipProb?: number[];
  hourlyCodes?: number[];
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

// ── Nearby city temperatures for map markers ─────────────────────────────────

const WORLD_CITIES: Array<{ name: string; lat: number; lng: number }> = [
  // British Isles
  { name: 'London',       lat: 51.5074, lng:  -0.1278 },
  { name: 'Manchester',   lat: 53.4808, lng:  -2.2426 },
  { name: 'Edinburgh',    lat: 55.9533, lng:  -3.1883 },
  { name: 'Dublin',       lat: 53.3498, lng:  -6.2603 },
  { name: 'Cardiff',      lat: 51.4816, lng:  -3.1791 },
  { name: 'Liverpool',    lat: 53.4084, lng:  -2.9916 },
  // France
  { name: 'Paris',        lat: 48.8566, lng:   2.3522 },
  { name: 'Lyon',         lat: 45.7640, lng:   4.8357 },
  { name: 'Marseille',    lat: 43.2965, lng:   5.3698 },
  { name: 'Bordeaux',     lat: 44.8378, lng:  -0.5792 },
  { name: 'Toulouse',     lat: 43.6047, lng:   1.4442 },
  { name: 'Nice',         lat: 43.7102, lng:   7.2620 },
  { name: 'Nantes',       lat: 47.2184, lng:  -1.5536 },
  { name: 'Strasbourg',   lat: 48.5734, lng:   7.7521 },
  // Germany
  { name: 'Berlin',       lat: 52.5200, lng:  13.4050 },
  { name: 'Hamburg',      lat: 53.5753, lng:   9.9932 },
  { name: 'Munich',       lat: 48.1351, lng:  11.5820 },
  { name: 'Frankfurt',    lat: 50.1109, lng:   8.6821 },
  { name: 'Cologne',      lat: 50.9333, lng:   6.9500 },
  { name: 'Stuttgart',    lat: 48.7758, lng:   9.1829 },
  { name: 'Dresden',      lat: 51.0504, lng:  13.7373 },
  { name: 'Düsseldorf',   lat: 51.2217, lng:   6.7762 },
  // Spain
  { name: 'Madrid',       lat: 40.4168, lng:  -3.7038 },
  { name: 'Barcelona',    lat: 41.3851, lng:   2.1734 },
  { name: 'Seville',      lat: 37.3891, lng:  -5.9845 },
  { name: 'Valencia',     lat: 39.4699, lng:  -0.3763 },
  { name: 'Bilbao',       lat: 43.2630, lng:  -2.9350 },
  { name: 'Zaragoza',     lat: 41.6488, lng:  -0.8891 },
  // Italy
  { name: 'Rome',         lat: 41.9028, lng:  12.4964 },
  { name: 'Milan',        lat: 45.4654, lng:   9.1859 },
  { name: 'Naples',       lat: 40.8518, lng:  14.2681 },
  { name: 'Florence',     lat: 43.7696, lng:  11.2558 },
  { name: 'Venice',       lat: 45.4408, lng:  12.3155 },
  { name: 'Turin',        lat: 45.0703, lng:   7.6869 },
  { name: 'Bologna',      lat: 44.4949, lng:  11.3426 },
  // Benelux + Switzerland + Austria
  { name: 'Amsterdam',    lat: 52.3676, lng:   4.9041 },
  { name: 'Brussels',     lat: 50.8503, lng:   4.3517 },
  { name: 'Zurich',       lat: 47.3769, lng:   8.5417 },
  { name: 'Vienna',       lat: 48.2082, lng:  16.3738 },
  { name: 'Rotterdam',    lat: 51.9244, lng:   4.4777 },
  { name: 'Bern',         lat: 46.9480, lng:   7.4474 },
  { name: 'Antwerp',      lat: 51.2194, lng:   4.4025 },
  // Nordics
  { name: 'Stockholm',    lat: 59.3293, lng:  18.0686 },
  { name: 'Oslo',         lat: 59.9139, lng:  10.7522 },
  { name: 'Copenhagen',   lat: 55.6761, lng:  12.5683 },
  { name: 'Helsinki',     lat: 60.1699, lng:  24.9384 },
  { name: 'Gothenburg',   lat: 57.7089, lng:  11.9746 },
  { name: 'Malmö',        lat: 55.6050, lng:  13.0038 },
  // Eastern Europe
  { name: 'Warsaw',       lat: 52.2297, lng:  21.0122 },
  { name: 'Prague',       lat: 50.0755, lng:  14.4378 },
  { name: 'Budapest',     lat: 47.4979, lng:  19.0402 },
  { name: 'Bucharest',    lat: 44.4268, lng:  26.1025 },
  { name: 'Athens',       lat: 37.9838, lng:  23.7275 },
  { name: 'Belgrade',     lat: 44.7866, lng:  20.4489 },
  { name: 'Kyiv',         lat: 50.4501, lng:  30.5234 },
  { name: 'Sofia',        lat: 42.6977, lng:  23.3219 },
  { name: 'Krakow',       lat: 50.0647, lng:  19.9450 },
  // Iberia
  { name: 'Lisbon',       lat: 38.7223, lng:  -9.1393 },
  { name: 'Porto',        lat: 41.1496, lng:  -8.6109 },
  // Turkey & Middle East
  { name: 'Istanbul',     lat: 41.0082, lng:  28.9784 },
  { name: 'Ankara',       lat: 39.9334, lng:  32.8597 },
  { name: 'Dubai',        lat: 25.2048, lng:  55.2708 },
  { name: 'Riyadh',       lat: 24.6877, lng:  46.7219 },
  { name: 'Cairo',        lat: 30.0444, lng:  31.2357 },
  { name: 'Tel Aviv',     lat: 32.0853, lng:  34.7818 },
  { name: 'Casablanca',   lat: 33.5731, lng:  -7.5898 },
  { name: 'Izmir',        lat: 38.4192, lng:  27.1287 },
  { name: 'Amman',        lat: 31.9539, lng:  35.9106 },
  // North America — US West (California density)
  { name: 'San Francisco',lat: 37.7749, lng:-122.4194 },
  { name: 'Oakland',      lat: 37.8044, lng:-122.2712 },
  { name: 'Berkeley',     lat: 37.8716, lng:-122.2727 },
  { name: 'San Jose',     lat: 37.3382, lng:-121.8863 },
  { name: 'Santa Cruz',   lat: 36.9741, lng:-122.0308 },
  { name: 'Monterey',     lat: 36.6002, lng:-121.8947 },
  { name: 'Salinas',      lat: 36.6777, lng:-121.6555 },
  { name: 'San Luis Obispo',lat:35.2828,lng:-120.6596 },
  { name: 'Santa Barbara',lat: 34.4208, lng:-119.6982 },
  { name: 'Ventura',      lat: 34.2805, lng:-119.2945 },
  { name: 'Sacramento',   lat: 38.5816, lng:-121.4944 },
  { name: 'Stockton',     lat: 37.9577, lng:-121.2908 },
  { name: 'Modesto',      lat: 37.6391, lng:-120.9969 },
  { name: 'Fresno',       lat: 36.7378, lng:-119.7871 },
  { name: 'Bakersfield',  lat: 35.3733, lng:-119.0187 },
  { name: 'Riverside',    lat: 33.9533, lng:-117.3962 },
  { name: 'Los Angeles',  lat: 34.0522, lng:-118.2437 },
  { name: 'Long Beach',   lat: 33.7701, lng:-118.1937 },
  { name: 'San Diego',    lat: 32.7157, lng:-117.1611 },
  { name: 'Las Vegas',    lat: 36.1716, lng:-115.1391 },
  { name: 'Henderson',    lat: 36.0395, lng:-114.9817 },
  { name: 'Phoenix',      lat: 33.4484, lng:-112.0740 },
  { name: 'Scottsdale',   lat: 33.4942, lng:-111.9261 },
  { name: 'Tucson',       lat: 32.2226, lng:-110.9747 },
  { name: 'Albuquerque',  lat: 35.0844, lng:-106.6504 },
  { name: 'Portland',     lat: 45.5231, lng:-122.6765 },
  { name: 'Salem',        lat: 44.9429, lng:-123.0351 },
  { name: 'Eugene',       lat: 44.0521, lng:-123.0868 },
  { name: 'Seattle',      lat: 47.6062, lng:-122.3321 },
  { name: 'Tacoma',       lat: 47.2529, lng:-122.4443 },
  { name: 'Spokane',      lat: 47.6588, lng:-117.4260 },
  { name: 'Salt Lake City',lat: 40.7608, lng:-111.8910 },
  { name: 'Provo',        lat: 40.2338, lng:-111.6585 },
  { name: 'Denver',       lat: 39.7392, lng:-104.9903 },
  { name: 'Colorado Springs',lat:38.8339,lng:-104.8214},
  { name: 'Reno',         lat: 39.5296, lng:-119.8138 },
  { name: 'Boise',        lat: 43.6150, lng:-116.2023 },
  // North America — US Midwest
  { name: 'Chicago',      lat: 41.8781, lng: -87.6298 },
  { name: 'Minneapolis',  lat: 44.9778, lng: -93.2650 },
  { name: 'Detroit',      lat: 42.3314, lng: -83.0458 },
  { name: 'Indianapolis', lat: 39.7684, lng: -86.1581 },
  { name: 'Columbus',     lat: 39.9612, lng: -82.9988 },
  { name: 'Kansas City',  lat: 39.0997, lng: -94.5786 },
  { name: 'St. Louis',    lat: 38.6270, lng: -90.1994 },
  { name: 'Milwaukee',    lat: 43.0389, lng: -87.9065 },
  // North America — US South & East
  { name: 'New York',     lat: 40.7128, lng: -74.0060 },
  { name: 'Philadelphia', lat: 39.9526, lng: -75.1652 },
  { name: 'Washington',   lat: 38.9072, lng: -77.0369 },
  { name: 'Boston',       lat: 42.3601, lng: -71.0589 },
  { name: 'Atlanta',      lat: 33.7490, lng: -84.3880 },
  { name: 'Miami',        lat: 25.7617, lng: -80.1918 },
  { name: 'Dallas',       lat: 32.7767, lng: -96.7970 },
  { name: 'Houston',      lat: 29.7604, lng: -95.3698 },
  { name: 'Nashville',    lat: 36.1627, lng: -86.7816 },
  { name: 'Charlotte',    lat: 35.2271, lng: -80.8431 },
  { name: 'Tampa',        lat: 27.9506, lng: -82.4572 },
  { name: 'New Orleans',  lat: 29.9511, lng: -90.0715 },
  { name: 'Baltimore',    lat: 39.2904, lng: -76.6122 },
  { name: 'Pittsburgh',   lat: 40.4406, lng: -79.9959 },
  { name: 'Cleveland',    lat: 41.4993, lng: -81.6944 },
  // Canada
  { name: 'Toronto',      lat: 43.6532, lng: -79.3832 },
  { name: 'Montreal',     lat: 45.5017, lng: -73.5673 },
  { name: 'Vancouver',    lat: 49.2827, lng:-123.1207 },
  { name: 'Calgary',      lat: 51.0447, lng:-114.0719 },
  { name: 'Ottawa',       lat: 45.4215, lng: -75.6972 },
  { name: 'Edmonton',     lat: 53.5461, lng:-113.4938 },
  { name: 'Winnipeg',     lat: 49.8951, lng: -97.1384 },
  // Mexico & Central America
  { name: 'Mexico City',  lat: 19.4326, lng: -99.1332 },
  { name: 'Guadalajara',  lat: 20.6597, lng:-103.3496 },
  { name: 'Monterrey',    lat: 25.6866, lng:-100.3161 },
  { name: 'Tijuana',      lat: 32.5149, lng:-117.0382 },
  // South America
  { name: 'São Paulo',    lat:-23.5505, lng: -46.6333 },
  { name: 'Buenos Aires', lat:-34.6037, lng: -58.3816 },
  { name: 'Rio',          lat:-22.9068, lng: -43.1729 },
  { name: 'Lima',         lat:-12.0464, lng: -77.0428 },
  { name: 'Bogotá',       lat:  4.7110, lng: -74.0721 },
  { name: 'Santiago',     lat:-33.4489, lng: -70.6693 },
  // Asia — East
  { name: 'Tokyo',        lat: 35.6762, lng: 139.6503 },
  { name: 'Osaka',        lat: 34.6937, lng: 135.5022 },
  { name: 'Seoul',        lat: 37.5665, lng: 126.9780 },
  { name: 'Beijing',      lat: 39.9042, lng: 116.4074 },
  { name: 'Shanghai',     lat: 31.2304, lng: 121.4737 },
  { name: 'Shenzhen',     lat: 22.5431, lng: 114.0579 },
  { name: 'Hong Kong',    lat: 22.3193, lng: 114.1694 },
  { name: 'Taipei',       lat: 25.0330, lng: 121.5654 },
  { name: 'Chengdu',      lat: 30.5728, lng: 104.0668 },
  // Asia — SE & South
  { name: 'Singapore',    lat:  1.3521, lng: 103.8198 },
  { name: 'Bangkok',      lat: 13.7563, lng: 100.5018 },
  { name: 'Jakarta',      lat: -6.2088, lng: 106.8456 },
  { name: 'Kuala Lumpur', lat:  3.1390, lng: 101.6869 },
  { name: 'Ho Chi Minh',  lat: 10.8231, lng: 106.6297 },
  { name: 'Manila',       lat: 14.5995, lng: 120.9842 },
  { name: 'Mumbai',       lat: 19.0760, lng:  72.8777 },
  { name: 'Delhi',        lat: 28.6139, lng:  77.2090 },
  { name: 'Bangalore',    lat: 12.9716, lng:  77.5946 },
  { name: 'Chennai',      lat: 13.0827, lng:  80.2707 },
  { name: 'Kolkata',      lat: 22.5726, lng:  88.3639 },
  { name: 'Karachi',      lat: 24.8607, lng:  67.0011 },
  { name: 'Lahore',       lat: 31.5204, lng:  74.3587 },
  { name: 'Dhaka',        lat: 23.8103, lng:  90.4125 },
  // Russia & Central Asia
  { name: 'Moscow',       lat: 55.7558, lng:  37.6173 },
  { name: 'St Petersburg',lat: 59.9311, lng:  30.3609 },
  { name: 'Novosibirsk',  lat: 54.9885, lng:  82.9207 },
  // Africa
  { name: 'Lagos',        lat:  6.5244, lng:   3.3792 },
  { name: 'Nairobi',      lat: -1.2921, lng:  36.8219 },
  { name: 'Johannesburg', lat:-26.2041, lng:  28.0473 },
  { name: 'Accra',        lat:  5.6037, lng:  -0.1870 },
  { name: 'Addis Ababa',  lat:  9.0054, lng:  38.7636 },
  { name: 'Tunis',        lat: 36.8190, lng:  10.1658 },
  { name: 'Algiers',      lat: 36.7372, lng:   3.0865 },
  { name: 'Cape Town',    lat:-33.9249, lng:  18.4241 },
  // Oceania
  { name: 'Sydney',       lat:-33.8688, lng: 151.2093 },
  { name: 'Melbourne',    lat:-37.8136, lng: 144.9631 },
  { name: 'Brisbane',     lat:-27.4698, lng: 153.0251 },
  { name: 'Perth',        lat:-31.9505, lng: 115.8605 },
  { name: 'Auckland',     lat:-36.8509, lng: 174.7645 },
];

function _distKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180)
    * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export interface CityTemp { name: string; lat: number; lng: number; temp: number; hourlyTemps: number[] }

export async function fetchNearbyCityTemps(
  lat: number,
  lng: number,
  count = 10,
): Promise<CityTemp[]> {
  const withDist = WORLD_CITIES
    .map(c => ({ ...c, dist: _distKm(lat, lng, c.lat, c.lng) }))
    .filter(c => c.dist > 15)
    .sort((a, b) => a.dist - b.dist);
  // Prefer cities within zoom-10 viewport (~120km). Fall back to nearest if sparse region.
  const inViewport = withDist.filter(c => c.dist <= 120);
  const pool = inViewport.length >= count ? inViewport : withDist;
  const sorted = pool.slice(0, count);
  if (!sorted.length) return [];
  try {
    const lats = sorted.map(c => c.lat.toFixed(4)).join(',');
    const lngs = sorted.map(c => c.lng.toFixed(4)).join(',');
    const res = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${lats}&longitude=${lngs}&current=temperature_2m&hourly=temperature_2m&forecast_days=2`,
    );
    if (!res.ok) return [];
    const data: unknown = await res.json();
    const results: Array<{ current?: { temperature_2m?: number }; hourly?: { temperature_2m?: number[] } }> = Array.isArray(data) ? data : [data];
    return sorted.map((c, i) => ({
      name: c.name, lat: c.lat, lng: c.lng,
      temp: Math.round(results[i]?.current?.temperature_2m ?? 0),
      hourlyTemps: (results[i]?.hourly?.temperature_2m ?? []).map(t => Math.round(t)),
    }));
  } catch { return []; }
}

// ── Wind vector grid for leaflet-velocity ─────────────────────────────────────

export interface WindGrid {
  la1: number; la2: number; lo1: number; lo2: number;
  dx: number;  dy: number;  nx: number;  ny: number;
  u: number[]; v: number[];
}

export async function fetchWindGrid(centerLat: number, centerLng: number): Promise<WindGrid | null> {
  const nx = 10, ny = 10, dx = 1, dy = 1;
  const la1 = Math.round(centerLat) + 4;
  const lo1 = Math.round(centerLng) - 5;
  const lats: string[] = [];
  const lngs: string[] = [];
  for (let row = 0; row < ny; row++) {
    for (let col = 0; col < nx; col++) {
      lats.push((la1 - row * dy).toFixed(1));
      lngs.push((lo1 + col * dx).toFixed(1));
    }
  }
  try {
    const res = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${lats.join(',')}&longitude=${lngs.join(',')}&current=wind_speed_10m,wind_direction_10m&forecast_days=1`,
    );
    if (!res.ok) return null;
    const data: unknown = await res.json();
    const results: Array<{ current?: { wind_speed_10m?: number; wind_direction_10m?: number } }> =
      Array.isArray(data) ? data : [data];
    const u: number[] = [], v: number[] = [];
    results.forEach(pt => {
      const spd = (pt?.current?.wind_speed_10m ?? 0) / 3.6; // km/h → m/s
      const dir = (pt?.current?.wind_direction_10m ?? 0) * Math.PI / 180;
      u.push(parseFloat((-spd * Math.sin(dir)).toFixed(3)));
      v.push(parseFloat((-spd * Math.cos(dir)).toFixed(3)));
    });
    return { la1, la2: la1 - (ny - 1) * dy, lo1, lo2: lo1 + (nx - 1) * dx, dx, dy, nx, ny, u, v };
  } catch { return null; }
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
      `&hourly=temperature_2m,wind_speed_10m,cloudcover,precipitation_probability,weather_code` +
      `&forecast_days=2&timezone=auto` +
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

    const hourlyRaw        = data.hourly ?? {};
    const hourlyTemps      = ((hourlyRaw.temperature_2m             as number[]) ?? []).slice(0, 48).map(Math.round);
    const hourlyWinds      = ((hourlyRaw.wind_speed_10m             as number[]) ?? []).slice(0, 48).map(Math.round);
    const hourlyClouds     = ((hourlyRaw.cloudcover                 as number[]) ?? []).slice(0, 48).map(Math.round);
    const hourlyPrecipProb = ((hourlyRaw.precipitation_probability  as number[]) ?? []).slice(0, 48).map(Math.round);
    const hourlyCodes      = ((hourlyRaw.weather_code               as number[]) ?? []).slice(0, 48);

    const utcOffsetSeconds: number = data.utc_offset_seconds ?? 0;

    return { temp, description, city, greeting, feelsLike, humidity, windKph, uvIndex, code, latitude, longitude, utcOffsetSeconds, hourlyTemps, hourlyWinds, hourlyClouds, hourlyPrecipProb, hourlyCodes };
  } catch {
    return null;
  }
}
