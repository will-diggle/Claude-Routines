import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  Modal,
  PanResponder,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import WebView from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import { GlassSurface, glassAvailable } from './GlassSurface';
import { WordPopup } from './WordPopup';
import { useTheme } from '../hooks/useTheme';
import type { WeatherData, RainviewerFrame, CityTemp, WindGrid } from '../services/weather';
import { fetchRainviewerFrames, fetchNearbyCityTemps, fetchWindGrid, WEATHER_IN } from '../services/weather';
import { getWeatherRichPhrase, getWeatherHeadline, LAYER_LABELS } from '../services/weatherPhrases';
import type { LanguageCode, LanguageLevel } from '../store/useSettingsStore';

const { width: SW } = Dimensions.get('window');
const MAP_H = Math.round((SW - 56) * 0.88);
const OWM_KEY = (process.env.EXPO_PUBLIC_OWM_KEY ?? '').trim();

type Layer = 'precipitation' | 'temperature' | 'wind' | 'clouds';

const OWM_PARAM: Record<Exclude<Layer, 'precipitation'>, string> = {
  temperature: 'temp_new',
  wind:        'wind_new',
  clouds:      'clouds_new',
};

const LAYER_ICONS: Record<Layer, React.ComponentProps<typeof Ionicons>['name']> = {
  precipitation: 'rainy-outline',
  temperature:   'thermometer-outline',
  wind:          'thunderstorm-outline',
  clouds:        'cloudy-outline',
};

export function codeToNightIcon(code: number): React.ComponentProps<typeof Ionicons>['name'] {
  if (code === 0) return 'sparkles-outline';     // clear — starry sky
  if (code <= 2)  return 'cloudy-night-outline'; // partly cloudy — moon visible
  if (code === 3) return 'cloudy-outline';        // overcast — plain cloud, no moon
  return codeToIcon(code);                        // rain/snow/thunder — same as day
}

export function codeToNightColor(code: number, dark: boolean): string {
  if (code === 0)  return '#FBBF24';                      // clear — gold stars, pops on any bg
  if (code <= 2)   return dark ? '#CBD5E1' : '#475569';   // partly cloudy — light grey moon
  if (code === 3)  return dark ? '#60A5FA' : '#1E3A8A';   // overcast — blue cloud
  return codeToColor(code);                                // rain/snow/thunder — day palette
}

export function codeToIcon(code: number): React.ComponentProps<typeof Ionicons>['name'] {
  if (code === 0)                      return 'sunny-outline';
  if (code <= 2)                       return 'partly-sunny-outline';
  if (code === 3)                      return 'cloudy-outline';
  if (code <= 48)                      return 'cloud-outline';
  if (code <= 65 || (code >= 80 && code <= 82)) return 'rainy-outline';
  if (code <= 86)                      return 'snow-outline';
  if (code >= 95)                      return 'thunderstorm-outline';
  return 'thermometer-outline';
}

export function codeToColor(code: number): string {
  if (code === 0)                                        return '#F59E0B'; // clear — amber
  if (code <= 2)                                         return '#60A5FA'; // mainly/partly clear — sky blue
  if (code === 3)                                        return '#6B7280'; // overcast — grey
  if (code <= 48)                                        return '#9CA3AF'; // fog — light grey
  if (code <= 67 || (code >= 80 && code <= 82))          return '#3B82F6'; // rain — blue
  if (code <= 77)                                        return '#BAE6FD'; // snow — pale blue
  if (code >= 95)                                        return '#7C3AED'; // thunderstorm — purple
  return '#9CA3AF';
}

function owmTileUrl(layer: Layer): string {
  if (layer === 'precipitation' || !OWM_KEY) return '';
  return `https://tile.openweathermap.org/map/${OWM_PARAM[layer]}/{z}/{x}/{y}.png?appid=${OWM_KEY}`;
}

function rainviewerTileUrl(path: string): string {
  return `https://tilecache.rainviewer.com${path}/256/{z}/{x}/{y}/2/1_1.png`;
}

// ── Localised date for weather modal header ───────────────────────────────────
const DAY_NAMES: Partial<Record<LanguageCode, string[]>> = {
  en: ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'],
  fr: ['dimanche','lundi','mardi','mercredi','jeudi','vendredi','samedi'],
  de: ['Sonntag','Montag','Dienstag','Mittwoch','Donnerstag','Freitag','Samstag'],
  sv: ['söndag','måndag','tisdag','onsdag','torsdag','fredag','lördag'],
  it: ['domenica','lunedì','martedì','mercoledì','giovedì','venerdì','sabato'],
  es: ['domingo','lunes','martes','miércoles','jueves','viernes','sábado'],
  tr: ['Pazar','Pazartesi','Salı','Çarşamba','Perşembe','Cuma','Cumartesi'],
  hu: ['vasárnap','hétfő','kedd','szerda','csütörtök','péntek','szombat'],
  ar: ['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'],
};

const MONTH_NAMES: Partial<Record<LanguageCode, string[]>> = {
  en: ['January','February','March','April','May','June','July','August','September','October','November','December'],
  fr: ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'],
  de: ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'],
  sv: ['januari','februari','mars','april','maj','juni','juli','augusti','september','oktober','november','december'],
  it: ['gennaio','febbraio','marzo','aprile','maggio','giugno','luglio','agosto','settembre','ottobre','novembre','dicembre'],
  es: ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'],
  tr: ['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'],
  hu: ['január','február','március','április','május','június','július','augusztus','szeptember','október','november','december'],
  ar: ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'],
};

const TOD_LABELS: Partial<Record<LanguageCode, [string, string, string]>> = {
  en: ['AM',      'Noon',   'PM'     ],
  fr: ['Matin',   'Midi',   'Soir'   ],
  de: ['Morgen',  'Mittag', 'Abend'  ],
  sv: ['Morgon',  'Middag', 'Kväll'  ],
  it: ['Mattina', 'Mezzo',  'Sera'   ],
  es: ['Mañana',  'Mediodía','Tarde' ],
  tr: ['Sabah',   'Öğle',   'Akşam' ],
  hu: ['Reggel',  'Dél',    'Este'   ],
  ar: ['صباح',   'ظهر',    'مساء'  ],
};

function localizedDate(lang: LanguageCode): string {
  const d = new Date();
  const day   = (DAY_NAMES[lang]   ?? DAY_NAMES.en!)[d.getDay()];
  const date  = d.getDate();
  const month = (MONTH_NAMES[lang] ?? MONTH_NAMES.en!)[d.getMonth()];
  if (lang === 'hu') return `${day}, ${month} ${date}.`;
  if (lang === 'ar') return `${day}، ${date} ${month}`;
  if (lang === 'de') return `${day}, ${date}. ${month}`;
  if (lang === 'es') return `${day}, ${date} de ${month}`;
  return `${day}, ${date} ${month}`;
}

// ── Weather-themed animated background for phrase card ───────────────────────

const PHRASE_W = SW - 40;
const PHRASE_H = 130;
const RAIN_N   = 14;
const SNOW_N   = 9;

type WxType = 'sunny' | 'cloud' | 'overcast' | 'fog' | 'rain' | 'snow' | 'thunder';
interface WxTheme { gradient: [string, string]; type: WxType; textLight: boolean }

export function getWxTheme(code: number): WxTheme {
  if (code === 0)                                              return { gradient: ['#29B6F6', '#0288D1'], type: 'sunny',    textLight: false };
  if (code <= 2)                                               return { gradient: ['#74B9FF', '#89CFF0'], type: 'cloud',    textLight: false };
  if (code === 3)                                              return { gradient: ['#78909C', '#546E7A'], type: 'overcast', textLight: true  };
  if (code <= 48)                                              return { gradient: ['#B0BEC5', '#CFD8DC'], type: 'fog',      textLight: false };
  if (code <= 67 || (code >= 80 && code <= 82))               return { gradient: ['#37474F', '#1C313A'], type: 'rain',     textLight: true  };
  if (code <= 77)                                              return { gradient: ['#BBDEFB', '#90CAF9'], type: 'snow',     textLight: false };
  if (code >= 95)                                              return { gradient: ['#1A237E', '#311B92'], type: 'thunder',  textLight: true  };
  return                                                              { gradient: ['#78909C', '#546E7A'], type: 'overcast', textLight: true  };
}

function WeatherBg({ code }: { code: number }) {
  const theme = getWxTheme(code);

  const rainCfg = useRef(
    Array.from({ length: RAIN_N }, (_, i) => ({
      anim: new Animated.Value(i / RAIN_N),
      x:    10 + Math.round(Math.random() * (PHRASE_W - 20)),
      dur:  600 + Math.round(Math.random() * 400),
    }))
  ).current;

  const snowCfg = useRef(
    Array.from({ length: SNOW_N }, (_, i) => ({
      y:    new Animated.Value(i / SNOW_N),
      sway: new Animated.Value(0),
      x:    Math.round(Math.random() * PHRASE_W),
      sz:   3 + Math.random() * 3,
      dur:  2400 + Math.round(Math.random() * 2000),
    }))
  ).current;

  const cloudCfg = useRef([
    { anim: new Animated.Value(0),    w: 80, h: 32, top: 5,  opacity: 0.55, dur: 9000 },
    { anim: new Animated.Value(0.38), w: 60, h: 24, top: 24, opacity: 0.40, dur: 12000 },
    { anim: new Animated.Value(0.70), w: 70, h: 28, top: 13, opacity: 0.45, dur: 10500 },
  ]).current;

  const sunScale  = useRef(new Animated.Value(1)).current;
  const lightning = useRef(new Animated.Value(0)).current;
  const ltRef     = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const running: Animated.CompositeAnimation[] = [];
    const type = theme.type;

    if (type === 'rain' || type === 'thunder') {
      rainCfg.forEach(({ anim, dur }) => {
        const a = Animated.loop(
          Animated.timing(anim, { toValue: 1, duration: dur, useNativeDriver: true, easing: Easing.linear })
        );
        a.start(); running.push(a);
      });
    }

    if (type === 'snow') {
      snowCfg.forEach(({ y, sway, dur }) => {
        const ya = Animated.loop(Animated.timing(y, { toValue: 1, duration: dur, useNativeDriver: true, easing: Easing.linear }));
        ya.start(); running.push(ya);
        const sa = Animated.loop(Animated.sequence([
          Animated.timing(sway, { toValue: 1,  duration: 1400, useNativeDriver: true }),
          Animated.timing(sway, { toValue: -1, duration: 1400, useNativeDriver: true }),
        ]));
        sa.start(); running.push(sa);
      });
    }

    if (type === 'cloud' || type === 'overcast') {
      cloudCfg.forEach(({ anim, dur }) => {
        const a = Animated.loop(Animated.timing(anim, { toValue: 1, duration: dur, useNativeDriver: true, easing: Easing.linear }));
        a.start(); running.push(a);
      });
    }

    if (type === 'sunny') {
      const a = Animated.loop(Animated.sequence([
        Animated.timing(sunScale, { toValue: 1.12, duration: 2000, useNativeDriver: true }),
        Animated.timing(sunScale, { toValue: 1,    duration: 2000, useNativeDriver: true }),
      ]));
      a.start(); running.push(a);
    }

    if (type === 'thunder') {
      function flash() {
        ltRef.current = setTimeout(() => {
          Animated.sequence([
            Animated.timing(lightning, { toValue: 0.65, duration: 70,  useNativeDriver: true }),
            Animated.timing(lightning, { toValue: 0,    duration: 90,  useNativeDriver: true }),
            Animated.timing(lightning, { toValue: 0.45, duration: 55,  useNativeDriver: true }),
            Animated.timing(lightning, { toValue: 0,    duration: 140, useNativeDriver: true }),
          ]).start(flash);
        }, 1800 + Math.random() * 3500);
      }
      flash();
    }

    return () => {
      running.forEach(a => a.stop());
      if (ltRef.current) clearTimeout(ltRef.current);
    };
  }, [theme.type]);

  const type = theme.type;

  return (
    <LinearGradient colors={[theme.gradient[0], theme.gradient[1]]} style={StyleSheet.absoluteFill}>
      {/* Sun disc */}
      {type === 'sunny' && (
        <Animated.View style={{
          position: 'absolute', right: 16, top: -16,
          width: 64, height: 64, borderRadius: 32,
          backgroundColor: '#FDD835', opacity: 0.9,
          transform: [{ scale: sunScale }],
          shadowColor: '#FDD835', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 1, shadowRadius: 24,
        }} />
      )}

      {/* Cloud blobs */}
      {(type === 'cloud' || type === 'overcast') && cloudCfg.map(({ anim, w, h, top, opacity }, i) => {
        const tX = anim.interpolate({ inputRange: [0, 1], outputRange: [-(w + 10), PHRASE_W + w + 10] });
        return (
          <Animated.View key={i} style={{
            position: 'absolute', top, width: w, height: h, borderRadius: h / 2,
            backgroundColor: type === 'overcast' ? 'rgba(180,195,205,0.7)' : 'rgba(255,255,255,0.85)',
            opacity, transform: [{ translateX: tX }],
          }} />
        );
      })}

      {/* Fog wisps */}
      {type === 'fog' && [0, 1, 2, 3].map(i => (
        <View key={i} style={{
          position: 'absolute', top: 10 + i * 18, left: 0, right: 0, height: 8,
          backgroundColor: `rgba(200,210,220,${0.18 + i * 0.06})`, borderRadius: 4,
        }} />
      ))}

      {/* Rain streaks */}
      {(type === 'rain' || type === 'thunder') && rainCfg.map(({ anim, x }, i) => {
        const tY = anim.interpolate({ inputRange: [0, 1], outputRange: [-24, PHRASE_H + 24] });
        return (
          <Animated.View key={i} style={{
            position: 'absolute', left: x, top: 0,
            width: 1.5, height: 14, borderRadius: 1,
            backgroundColor: 'rgba(176,213,244,0.72)',
            transform: [{ translateY: tY }, { rotate: '12deg' }],
          }} />
        );
      })}

      {/* Lightning flash */}
      {type === 'thunder' && (
        <Animated.View style={{ ...StyleSheet.absoluteFillObject, backgroundColor: '#90A4AE', opacity: lightning }} />
      )}

      {/* Snowflakes */}
      {type === 'snow' && snowCfg.map(({ y, sway, x, sz }, i) => {
        const tY = y.interpolate({ inputRange: [0, 1], outputRange: [-sz * 2, PHRASE_H + sz * 2] });
        const tX = sway.interpolate({ inputRange: [-1, 1], outputRange: [-10, 10] });
        return (
          <Animated.View key={i} style={{
            position: 'absolute', left: x, top: 0,
            width: sz, height: sz, borderRadius: sz / 2,
            backgroundColor: 'rgba(255,255,255,0.9)',
            transform: [{ translateY: tY }, { translateX: tX }],
          }} />
        );
      })}

      {/* Readability scrim — softens bottom of card so text reads cleanly */}
      <LinearGradient
        colors={['transparent', theme.textLight ? 'rgba(0,0,0,0.28)' : 'rgba(0,0,0,0.10)']}
        style={StyleSheet.absoluteFill}
        start={{ x: 0, y: 0.35 }}
        end={{ x: 0, y: 1 }}
      />
    </LinearGradient>
  );
}

// ── Map style catalogue ────────────────────────────────────────────────────────
export type MapStyleKey = 'esri_gray' | 'carto_pos' | 'carto_voy' | 'osm' | 'esri_topo' | 'esri_sat';

export const MAP_STYLE_LIST: Array<{ key: MapStyleKey; label: string }> = [
  { key: 'esri_gray', label: 'Minimal'   },
  { key: 'carto_pos', label: 'Positron'  },
  { key: 'carto_voy', label: 'Voyager'   },
  { key: 'osm',       label: 'Street'    },
  { key: 'esri_topo', label: 'Topo'      },
  { key: 'esri_sat',  label: 'Satellite' },
];

const MAP_STYLE_ACCENT: Record<MapStyleKey, string> = {
  esri_gray: '#5C8BC7', // muted blue on gray canvas
  carto_pos: '#1A8FA5', // teal on clean white Positron
  carto_voy: '#1A1A1A', // Voyager's black labels
  osm:       '#0078A8', // classic OSM blue
  esri_topo: '#7A6351', // earthy brown for topo contours
  esri_sat:  '#00C7B7', // cyan pops on dark satellite
};

function buildMapHtml(lat: number, lng: number, isDark: boolean, styleKey: MapStyleKey): string {
  const dotColor  = isDark ? '#fff' : '#111';
  const dotBorder = isDark ? '#555' : '#fff';
  const ringColor = isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.15)';

  let tileLayers: string;
  switch (styleKey) {
    case 'carto_pos':
      tileLayers = `L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',{maxZoom:19}).addTo(map);`;
      break;
    case 'carto_voy':
      tileLayers = `L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png',{maxZoom:19}).addTo(map);`;
      break;
    case 'osm':
      tileLayers = `L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19}).addTo(map);`;
      break;
    case 'esri_topo':
      tileLayers = `L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}',{maxZoom:19}).addTo(map);`;
      break;
    case 'esri_sat':
      tileLayers = `
L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',{maxZoom:19}).addTo(map);
L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',{maxZoom:19,opacity:0.9}).addTo(map);`;
      break;
    default: { // esri_gray — theme-aware, max zoom 16 for gray canvas layers
      const base  = isDark
        ? 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}'
        : 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}';
      const lbl   = isDark
        ? 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}'
        : 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}';
      tileLayers = `
L.tileLayer('${base}',{maxZoom:16}).addTo(map);
L.tileLayer('${lbl}',{maxZoom:16,opacity:0.9}).addTo(map);`;
    }
  }

  return `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<link rel="stylesheet" href="https://unpkg.com/leaflet-velocity@1.9.2/dist/leaflet-velocity.min.css"/>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body,html{width:100%;height:100%;overflow:hidden}
#map{width:100%;height:100vh}
.leaflet-control-attribution,.leaflet-control-zoom,.leaflet-velocity-control{display:none!important}
.loc-wrap{position:relative;width:26px;height:26px}
.loc-dot{position:absolute;width:14px;height:14px;border-radius:50%;background:${dotColor};border:2.5px solid ${dotBorder};top:6px;left:6px;z-index:2;box-shadow:0 2px 6px rgba(0,0,0,0.45)}
.loc-ring{position:absolute;width:26px;height:26px;border-radius:50%;background:${ringColor};animation:locpulse 2s ease-out infinite;z-index:1}
@keyframes locpulse{0%{transform:scale(0.4);opacity:1}100%{transform:scale(1.6);opacity:0}}
.ct{background:rgba(255,255,255,0.93);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);border-radius:20px;padding:4px 11px;text-align:center;font-family:-apple-system,sans-serif;pointer-events:none;line-height:1.25;box-shadow:0 2px 10px rgba(0,0,0,0.22),0 1px 3px rgba(0,0,0,0.14)}
.ct-name{font-size:8px;color:rgba(0,0,0,0.45);font-weight:600;white-space:nowrap}
.ct-temp{font-size:14px;font-weight:700;white-space:nowrap}
</style>
</head>
<body>
<div id="map"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script src="https://unpkg.com/leaflet-velocity@1.9.2/dist/leaflet-velocity.min.js"></script>
<script>
var map=L.map('map',{
  center:[${lat},${lng}],zoom:10,
  dragging:true,touchZoom:true,scrollWheelZoom:false,
  doubleClickZoom:true,zoomControl:false,attributionControl:false
});
${tileLayers}
var locIcon=L.divIcon({className:'',html:'<div class="loc-wrap"><div class="loc-ring"></div><div class="loc-dot"></div></div>',iconSize:[26,26],iconAnchor:[13,13]});
L.marker([${lat},${lng}],{icon:locIcon,interactive:false}).addTo(map);

var weatherLayer=null;
var velocityLayer=null;
var cityGroup=L.layerGroup().addTo(map);
var accent='${MAP_STYLE_ACCENT[styleKey]}';
function tempCol(t){
  if(t<=-10) return '#1D4ED8';
  if(t<=0)   return '#60A5FA';
  if(t<=15)  return '#93C5FD';
  if(t<=22)  return '#FCD34D';
  if(t<=28)  return '#F97316';
  if(t<=35)  return '#EF4444';
  return '#B91C1C';
}

window.setLayer=function(url,maxNative){
  if(weatherLayer){map.removeLayer(weatherLayer);weatherLayer=null;}
  if(url){weatherLayer=L.tileLayer(url,{opacity:0.65,maxZoom:19,maxNativeZoom:maxNative||19,minZoom:0});weatherLayer.addTo(map);}
};

window.setVelocity=function(g){
  if(velocityLayer){map.removeLayer(velocityLayer);velocityLayer=null;}
  if(!g)return;
  var hdr={parameterCategory:2,la1:g.la1,la2:g.la2,lo1:g.lo1,lo2:g.lo2,dx:g.dx,dy:g.dy,nx:g.nx,ny:g.ny,refTime:'2000-01-01T00:00:00Z',forecastTime:0};
  velocityLayer=L.velocityLayer({
    displayValues:false,
    data:[
      {header:Object.assign({},hdr,{parameterNumber:2}),data:g.u},
      {header:Object.assign({},hdr,{parameterNumber:3}),data:g.v}
    ],
    maxVelocity:15,
    colorScale:['rgba(180,220,255,0.35)','rgba(120,180,255,0.55)','rgba(60,120,255,0.7)','rgba(20,60,200,0.8)','rgba(160,40,200,0.85)'],
    particleAge:64,
    lineWidth:1.8,
    particleMultiplier:0.0035,
    velocityScale:0.007,
    opacity:0.9
  });
  velocityLayer.addTo(map);
};

window.clearVelocity=function(){
  if(velocityLayer){map.removeLayer(velocityLayer);velocityLayer=null;}
};

window.setCities=function(cities){
  cityGroup.clearLayers();
  cities.forEach(function(c){
    var icon=L.divIcon({
      className:'',
      html:'<div class="ct"><div class="ct-name">'+c.name+'</div><div class="ct-temp" style="color:'+tempCol(c.temp)+'">'+c.temp+'°</div></div>',
      iconSize:[80,36],
      iconAnchor:[40,18]
    });
    L.marker([c.lat,c.lng],{icon:icon,interactive:false}).addTo(cityGroup);
  });
};

window.addEventListener('load',function(){
  if(window.ReactNativeWebView)window.ReactNativeWebView.postMessage(JSON.stringify({type:'ready'}));
});
var _moveTimer=null;
map.on('moveend',function(){
  clearTimeout(_moveTimer);
  _moveTimer=setTimeout(function(){
    var c=map.getCenter();
    if(window.ReactNativeWebView)window.ReactNativeWebView.postMessage(JSON.stringify({type:'mapMove',lat:c.lat,lng:c.lng}));
  },600);
});
</script>
</body>
</html>`;
}

function formatHour(unixSec: number): string {
  const d = new Date(unixSec * 1000);
  return `${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}`;
}

// ── Hourly graph (all layers including precipitation) ─────────────────────────

type StaticLayer = 'temperature' | 'wind' | 'clouds' | 'precipitation';

function tempBarColor(v: number): string {
  if (v <= -10) return '#1D4ED8';
  if (v <= 0)   return '#60A5FA';
  if (v <= 15)  return '#93C5FD';
  if (v <= 22)  return '#FCD34D';
  if (v <= 28)  return '#F97316';
  if (v <= 35)  return '#EF4444';
  return '#B91C1C';
}
function windBarColor(v: number): string {
  const t = Math.min(v / 60, 1);
  const r = Math.round(255 - t * 196);
  const g = Math.round(255 - t * 125);
  const b = Math.round(255 - t * 9);
  return `rgb(${r},${g},${b})`;
}
function cloudBarColor(v: number): string {
  const lum = Math.round(200 - (v / 100) * 140);
  return `rgba(${lum},${lum},${lum},${0.55 + (v / 100) * 0.45})`;
}
function precipBarColor(v: number): string {
  const alpha = 0.2 + (v / 100) * 0.8;
  return `rgba(96,165,250,${alpha})`;
}

const LAYER_ICON_COLORS: Record<Layer, string> = {
  precipitation: '#60A5FA',
  temperature:   '#F87171',
  wind:          '#5EEAD4',
  clouds:        '#9CA3AF',
};

function tempColor(t: number): string {
  if (t <= -10) return '#1D4ED8';
  if (t <= 0)   return '#60A5FA';
  if (t <= 15)  return '#93C5FD';
  if (t <= 22)  return '#FCD34D';
  if (t <= 28)  return '#F97316';
  if (t <= 35)  return '#EF4444';
  return '#B91C1C';
}

// Top-left overlay — floating text, no background box
const TEXT_SHADOW = {
  textShadowColor: 'rgba(0,0,0,0.55)',
  textShadowOffset: { width: 0, height: 1 },
  textShadowRadius: 4,
} as const;

function DataBadge({ tempValues, rainValues, windValues, selectedHour, accentColor }: {
  accentColor: string;
  tempValues: number[];
  rainValues: number[];
  windValues: number[];
  selectedHour: number;
}) {
  if (!tempValues.length) return null;
  const idx  = Math.min(selectedHour, tempValues.length - 1);
  const temp = Math.round(tempValues[idx] ?? 0);
  const hi   = Math.max(...tempValues);
  const lo   = Math.min(...tempValues);
  const rain = rainValues.length ? Math.round(rainValues[Math.min(idx, rainValues.length - 1)] ?? 0) : null;
  const wind = windValues.length ? Math.round(windValues[Math.min(idx, windValues.length - 1)] ?? 0) : null;
  return (
    <View style={dbStyles.badge}>
      <Text style={[dbStyles.big, { color: tempColor(temp) }]}>{temp}°</Text>
      <Text style={dbStyles.hilo}>
        <Text style={{ color: tempColor(hi) }}>↑{hi}°</Text>
        <Text style={{ color: accentColor }}> </Text>
        <Text style={{ color: tempColor(lo) }}>↓{lo}°</Text>
      </Text>
      {rain !== null && <Text style={[dbStyles.row, { color: '#38BDF8' }]}>Rain {rain}%</Text>}
      {wind !== null && <Text style={[dbStyles.row, { color: '#94A3B8' }]}>Wind {wind} km/h</Text>}
    </View>
  );
}

const dbStyles = StyleSheet.create({
  badge: { position: 'absolute', top: 10, left: 10, zIndex: 10, alignItems: 'flex-start', paddingHorizontal: 12, paddingVertical: 8 },
  big:   { fontSize: 52, fontWeight: '700', color: '#fff', lineHeight: 56 },
  hilo:  { fontSize: 17, fontWeight: '600', color: 'rgba(255,255,255,0.95)', marginTop: 2 },
  row:   { fontSize: 14, fontWeight: '500', color: 'rgba(255,255,255,0.88)', marginTop: 3 },
});

function HourlyGraph({ values, layer, selectedHour, onHourChange, startHour }: {
  values: number[];
  layer: StaticLayer;
  selectedHour: number;
  onHourChange: (h: number) => void;
  startHour: number;
}) {
  if (!values.length) return null;
  const count = values.length;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(max - min, 1);
  const BAR_H = 36;
  const THUMB_R     = 11;
  const trackWidth  = useRef(0);
  const [trackW, setTrackW] = useState(0);
  const lastHourRef = useRef(-1);
  const startXRef   = useRef(0);

  function scrubTo(x: number) {
    const tw = trackWidth.current;
    if (!tw) return;
    const usable = tw - THUMB_R * 2;
    if (usable <= 0) return;
    const clamped = Math.max(THUMB_R, Math.min(x, tw - THUMB_R));
    const h = Math.round(((clamped - THUMB_R) / usable) * (count - 1));
    if (h !== lastHourRef.current) {
      lastHourRef.current = h;
      onHourChange(h);
      Haptics.selectionAsync().catch(() => {});
    }
  }

  const scrubPan = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder:  () => true,
    onPanResponderGrant: (e) => {
      startXRef.current = e.nativeEvent.locationX;
      scrubTo(e.nativeEvent.locationX);
    },
    onPanResponderMove: (e, gs) => scrubTo(startXRef.current + gs.dx),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [onHourChange, count]);

  // Pixel-based thumb position so it stays within the track boundaries
  const thumbLeft = trackW > 0
    ? THUMB_R + (selectedHour / Math.max(count - 1, 1)) * (trackW - THUMB_R * 2)
    : THUMB_R;

  return (
    <View style={hgStyles.container}>
      {/* Scrubber — tall touch target for easy thumb sliding */}
      <View
        style={hgStyles.scrubTrack}
        onLayout={e => {
          trackWidth.current = e.nativeEvent.layout.width;
          setTrackW(e.nativeEvent.layout.width);
        }}
        {...scrubPan.panHandlers}
      >
        <View style={hgStyles.scrubLine} />
        <View style={[hgStyles.scrubThumb, { left: thumbLeft }]} />
      </View>

      <View style={hgStyles.timeRow}>
        {[0, 6, 12, 18, count - 1].map((pos, i, arr) => {
          const clockHour = (startHour + pos) % 24;
          const label = `${clockHour.toString().padStart(2, '0')}:00`;
          const isFirst = i === 0;
          const isLast  = i === arr.length - 1;
          // Pin first/last to line endpoints; center middle labels proportionally
          if (isFirst) {
            return <Text key={pos} style={[hgStyles.timeLbl, { left: THUMB_R }]}>{label}</Text>;
          }
          if (isLast) {
            return <Text key={pos} style={[hgStyles.timeLbl, { right: THUMB_R }]}>{label}</Text>;
          }
          const usable = Math.max(trackW - THUMB_R * 2, 1);
          const px = THUMB_R + (pos / (count - 1)) * usable;
          return (
            <Text key={pos} style={[hgStyles.timeLbl, { left: px, transform: [{ translateX: -13 }] }]}>
              {label}
            </Text>
          );
        })}
      </View>
    </View>
  );
}

const hgStyles = StyleSheet.create({
  container:   { paddingHorizontal: 12, paddingTop: 8, paddingBottom: 2 },
  barsRow:     { flexDirection: 'row', alignItems: 'flex-end', height: 40, gap: 1 },
  barCol:      { flex: 1, alignItems: 'center', justifyContent: 'flex-end' },
  bar:         { width: '85%', borderRadius: 2 },
  barSelected: { opacity: 1, borderWidth: 1, borderColor: '#fff' },
  scrubTrack:  { height: 56, justifyContent: 'center', position: 'relative', marginTop: 0 },
  scrubLine:   { position: 'absolute', left: 11, right: 11, height: 1, backgroundColor: 'rgba(120,120,120,0.6)', borderRadius: 1 },
  scrubThumb:  { position: 'absolute', width: 22, height: 22, borderRadius: 11, backgroundColor: '#fff', top: '50%', marginTop: -11, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.18, shadowRadius: 4, elevation: 4 },
  timeRow:     { position: 'relative', height: 20, marginTop: 1, marginBottom: 4 },
  timeLbl:     { position: 'absolute', fontSize: 11, color: 'rgba(40,40,40,0.75)' },
});

// ── Scrubber ──────────────────────────────────────────────────────────────────

function Scrubber({ frames, frameIdx, isPlaying, onScrub, onTogglePlay }: {
  frames: RainviewerFrame[];
  frameIdx: number;
  isPlaying: boolean;
  onScrub: (idx: number) => void;
  onTogglePlay: () => void;
}) {
  const trackWidth = useRef(0);

  const nowIdx = useMemo(() => {
    const nowSec = Date.now() / 1000;
    let best = 0;
    frames.forEach((f, i) => { if (f.time <= nowSec) best = i; });
    return best;
  }, [frames]);

  const panResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder:  () => true,
    onPanResponderGrant: (evt) => {
      if (!trackWidth.current) return;
      const x = Math.max(0, Math.min(evt.nativeEvent.locationX, trackWidth.current));
      onScrub(Math.round((x / trackWidth.current) * (frames.length - 1)));
    },
    onPanResponderMove: (evt) => {
      if (!trackWidth.current) return;
      const x = Math.max(0, Math.min(evt.nativeEvent.locationX, trackWidth.current));
      onScrub(Math.round((x / trackWidth.current) * (frames.length - 1)));
    },
  }), [frames.length, onScrub]);

  const pct = (idx: number) => frames.length > 1 ? (idx / (frames.length - 1)) * 100 : 0;
  const thumbPct = pct(frameIdx);

  return (
    <View style={scrubStyles.container}>
      <TouchableOpacity style={scrubStyles.playBtn} onPress={onTogglePlay} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <Ionicons name={isPlaying ? 'pause' : 'play'} size={13} color="#fff" />
      </TouchableOpacity>
      <View
        style={scrubStyles.track}
        onLayout={e => { trackWidth.current = e.nativeEvent.layout.width; }}
        {...panResponder.panHandlers}
      >
        <View style={scrubStyles.trackLine} />
        <View style={[scrubStyles.fill, { width: `${thumbPct}%` as any }]} />
        {frames.length > 0 && <View style={[scrubStyles.nowMark, { left: `${pct(nowIdx)}%` as any }]} />}
        <View style={[scrubStyles.thumb, { left: `${thumbPct}%` as any }]} />
        {frames.length > 0 && [0, nowIdx, frames.length - 1].map((idx, i) => (
          <Text key={i} style={[scrubStyles.label, { left: `${pct(idx)}%` as any, color: idx === nowIdx ? '#fff' : 'rgba(255,255,255,0.65)' }]}>
            {idx === nowIdx ? 'now' : formatHour(frames[idx].time)}
          </Text>
        ))}
      </View>
    </View>
  );
}

const scrubStyles = StyleSheet.create({
  container: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 11, gap: 10 },
  playBtn:   { width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' },
  track:     { flex: 1, height: 28, justifyContent: 'center', position: 'relative' },
  trackLine: { position: 'absolute', height: 2, left: 0, right: 0, backgroundColor: 'rgba(255,255,255,0.3)', borderRadius: 1, top: '50%', marginTop: -1 },
  fill:      { position: 'absolute', height: 2, backgroundColor: '#fff', borderRadius: 1, top: '50%', marginTop: -1 },
  nowMark:   { position: 'absolute', width: 2, height: 10, backgroundColor: '#93C5FD', borderRadius: 1, top: '50%', marginTop: -5, marginLeft: -1 },
  thumb:     { position: 'absolute', width: 14, height: 14, borderRadius: 7, backgroundColor: '#fff', top: '50%', marginTop: -7, marginLeft: -7, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.3, shadowRadius: 2, elevation: 3 },
  label:     { position: 'absolute', fontSize: 9, fontWeight: '600', top: '50%', marginTop: 8, transform: [{ translateX: -12 }], textShadowColor: 'rgba(0,0,0,0.6)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 },
});

// ── Layer toggle ──────────────────────────────────────────────────────────────

function LayerToggle({ activeLayer, hasOwmKey, labels, onSelect }: {
  activeLayer: Layer;
  hasOwmKey: boolean;
  labels: { precipitation: string; temperature: string; wind: string; clouds: string };
  onSelect: (l: Layer) => void;
}) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const layers: Layer[] = [
    'precipitation',
    'wind',
    ...(hasOwmKey ? (['temperature', 'clouds'] as Layer[]) : []),
  ];

  return (
    <View style={ltStyles.wrapper}>
      <TouchableOpacity
        style={[ltStyles.btn, { backgroundColor: colors.surface }]}
        onPress={() => setOpen(o => !o)}
        activeOpacity={0.8}
      >
        <Ionicons name={LAYER_ICONS[activeLayer]} size={15} color={LAYER_ICON_COLORS[activeLayer]} />
      </TouchableOpacity>
      {open && (
        <View style={[ltStyles.menu, { backgroundColor: colors.surface }]}>
          {layers.map(layer => (
            <TouchableOpacity key={layer} style={ltStyles.item} activeOpacity={0.7}
              onPress={() => { onSelect(layer); setOpen(false); }}>
              <Ionicons name={LAYER_ICONS[layer]} size={13} color={LAYER_ICON_COLORS[layer]} style={{ width: 18, opacity: activeLayer === layer ? 1 : 0.5 }} />
              <Text style={[ltStyles.itemText, { color: activeLayer === layer ? colors.inkDark : colors.inkFaint }, activeLayer === layer && ltStyles.itemActive]}>{labels[layer]}</Text>
              {activeLayer === layer && <Ionicons name="checkmark" size={12} color={colors.inkDark} />}
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

const ltStyles = StyleSheet.create({
  wrapper:    { position: 'absolute', top: 10, right: 10, alignItems: 'flex-end', zIndex: 20 },
  btn:        { width: 32, height: 32, borderRadius: 9, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 4 },
  menu:       { marginTop: 5, borderRadius: 12, paddingVertical: 4, minWidth: 155, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.12, shadowRadius: 12, elevation: 8 },
  item:       { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10 },
  itemText:   { fontSize: 13, flex: 1 },
  itemActive: { fontWeight: '600' },
});

// ── WeatherCard ───────────────────────────────────────────────────────────────

interface WeatherCardProps {
  weather: WeatherData;
  language: LanguageCode;
  level: LanguageLevel;
  modalY?: number;
  iPadLayout?: boolean;
}

export interface WeatherCardHandle { openModal: () => void; }

export const WeatherCard = forwardRef<WeatherCardHandle, WeatherCardProps>(function WeatherCard({ weather, language, level, modalY, iPadLayout = false }, ref) {
  const { colors, fontFamily, fontSize, isDark } = useTheme();

  const [modalVisible, setModalVisible] = useState(false);
  const [activeLayer, setActiveLayer]   = useState<Layer>('precipitation');
  const [frames, setFrames]             = useState<RainviewerFrame[]>([]);
  const [frameIdx, setFrameIdx]         = useState(0);
  const [isPlaying, setIsPlaying]       = useState(true);
  const [mapReady, setMapReady]         = useState(false);
  // Current hour in the forecast location's timezone (not device timezone)
  const currentHour = useMemo(() => {
    const offsetSec = weather.utcOffsetSeconds ?? 0;
    return Math.floor((Date.now() / 1000 + offsetSec) / 3600) % 24;
  }, [weather.utcOffsetSeconds]);
  const isLocationNight = currentHour < 5 || currentHour >= 20;
  const [selectedHour, setSelectedHour] = useState(0);
  const [cityTemps, setCityTemps]       = useState<CityTemp[]>([]);
  const [windGrid, setWindGrid]         = useState<WindGrid | null>(null);
  const [mapCenter, setMapCenter]       = useState<{ lat: number; lng: number } | null>(null);

  const mapStyleKey: MapStyleKey = 'carto_voy';

  const webViewRef = useRef<WebView>(null);
  const playRef    = useRef<ReturnType<typeof setInterval> | null>(null);
  const scaleAnim  = useRef(new Animated.Value(0.88)).current;
  const stripRef   = useRef<View>(null);
  const [modalTop, setModalTop] = useState(300);

  const todayTemps  = weather.hourlyTemps?.slice(0, 24) ?? [];
  const highTemp    = todayTemps.length > 0 ? Math.max(...todayTemps) : weather.temp;
  const lowTemp     = todayTemps.length > 0 ? Math.min(...todayTemps) : weather.temp;
  const rainChance  = Math.max(...(weather.hourlyPrecipProb?.slice(0, 24) ?? [0]));
  const phrase      = getWeatherRichPhrase(weather.city, weather.description, weather.greeting, highTemp, lowTemp, rainChance, weather.windKph, language, level, weather.temp);
  const headline    = getWeatherHeadline(weather.city, highTemp, weather.description, language);
  const labels      = LAYER_LABELS[language] ?? LAYER_LABELS.en!;
  const hasOwmKey   = OWM_KEY.length > 0;
  const iconName    = isLocationNight ? codeToNightIcon(weather.code ?? 0) : codeToIcon(weather.code ?? 0);
  const iconColor   = isLocationNight ? codeToNightColor(weather.code ?? 0, isDark) : codeToColor(weather.code ?? 0);
  const preposition = WEATHER_IN[language] ?? 'in';

  const mapLat  = weather.latitude  ?? 51.5074;
  const mapLng  = weather.longitude ?? -0.1278;
  const fetchLat = mapCenter?.lat ?? mapLat;
  const fetchLng = mapCenter?.lng ?? mapLng;
  const mapHtml = useMemo(() => buildMapHtml(mapLat, mapLng, isDark, mapStyleKey), [mapLat, mapLng, isDark, mapStyleKey]);

  // Fetch/refresh RainViewer frames on mount and each time the modal opens
  const loadFrames = useCallback(() => {
    fetchRainviewerFrames().then(f => {
      if (!f.length) return;
      setFrames(f);
      const nowSec = Date.now() / 1000;
      let nowIdx = 0;
      f.forEach((fr, i) => { if (fr.time <= nowSec) nowIdx = i; });
      setFrameIdx(nowIdx);
    });
  }, []);

  useEffect(() => { loadFrames(); }, [loadFrames]);

  // Apply tile overlay to WebView.
  // temperature → city markers already always shown, no tile overlay needed
  // wind → leaflet-velocity handles it, no tile overlay
  // clouds → OWM tile
  // precipitation → RainViewer animated radar
  const applyTile = useCallback((layer: Layer, idx: number, ready: boolean) => {
    if (!ready) return;
    if (layer === 'wind' || layer === 'temperature') {
      webViewRef.current?.injectJavaScript(`window.setLayer(''); true;`);
      return;
    }
    if (layer === 'precipitation') {
      if (frames.length === 0) return; // wait for frames to arrive
      const safeIdx = Math.min(idx, frames.length - 1);
      const url = rainviewerTileUrl(frames[safeIdx].path);
      webViewRef.current?.injectJavaScript(`window.setLayer('${url}',6); true;`);
    } else {
      const url = owmTileUrl(layer); // clouds only
      webViewRef.current?.injectJavaScript(`window.setLayer('${url}'); true;`);
    }
  }, [frames]);

  useEffect(() => { applyTile(activeLayer, frameIdx, mapReady); }, [activeLayer, frameIdx, mapReady, applyTile]);

  // Auto-play (precipitation only)
  useEffect(() => {
    if (playRef.current) clearInterval(playRef.current);
    if (isPlaying && activeLayer === 'precipitation' && frames.length > 0) {
      playRef.current = setInterval(() => setFrameIdx(i => (i + 1) % frames.length), 700);
    }
    return () => { if (playRef.current) clearInterval(playRef.current); };
  }, [isPlaying, activeLayer, frames.length]);

  // Fetch city temps + refresh rain frames when modal opens or map is panned
  useEffect(() => {
    if (!modalVisible) return;
    let cancelled = false;
    fetchNearbyCityTemps(fetchLat, fetchLng).then(cities => {
      if (!cancelled && cities.length > 0) setCityTemps(cities);
    });
    loadFrames();
    return () => { cancelled = true; };
  }, [modalVisible, fetchLat, fetchLng, loadFrames]);

  // Inject city markers once map + city data are ready; prepend user's own city
  // Re-runs when selectedHour changes so pills show the scrubbed hour's temperature
  useEffect(() => {
    if (!mapReady) return;
    const hourIdx = currentHour + selectedHour;
    const userTemp = selectedHour > 0
      ? Math.round(weather.hourlyTemps?.[hourIdx] ?? weather.temp)
      : Math.round(weather.temp);
    const userCity: CityTemp = { name: weather.city, lat: mapLat, lng: mapLng, temp: userTemp, hourlyTemps: weather.hourlyTemps ?? [] };
    // Strip hourlyTemps before injection — only name/lat/lng/temp needed in WebView
    const all = [userCity, ...cityTemps].map(c => ({
      name: c.name, lat: c.lat, lng: c.lng,
      temp: selectedHour > 0 ? (c.hourlyTemps[hourIdx] ?? c.temp) : c.temp,
    }));
    webViewRef.current?.injectJavaScript(`window.setCities(${JSON.stringify(all)}); true;`);
  }, [mapReady, cityTemps, weather.city, weather.temp, weather.hourlyTemps, mapLat, mapLng, selectedHour, currentHour]);

  // Inject velocity data when wind grid arrives
  useEffect(() => {
    if (!mapReady || activeLayer !== 'wind' || !windGrid) return;
    webViewRef.current?.injectJavaScript(`window.setVelocity(${JSON.stringify(windGrid)}); true;`);
  }, [mapReady, windGrid, activeLayer]);

  function openModal() {
    // Use the pre-measured edition row Y (same anchor as streak calendar) when available
    if (modalY && modalY > 0) {
      setModalTop(modalY);
    } else {
      stripRef.current?.measure((_x, _y, _w, h, _px, py) => {
        setModalTop(py + h + 6);
      });
    }
    setModalVisible(true);
    scaleAnim.setValue(0.88);
    Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, tension: 200, friction: 16 }).start();
  }

  function closeModal() {
    Animated.timing(scaleAnim, { toValue: 0.88, duration: 160, useNativeDriver: true })
      .start(() => setModalVisible(false));
  }

  useImperativeHandle(ref, () => ({ openModal }));

  const handleLayerSelect = useCallback((layer: Layer) => {
    setActiveLayer(layer);
    setIsPlaying(layer === 'precipitation');
    setSelectedHour(0);
    if (layer === 'wind') {
      fetchWindGrid(mapLat, mapLng).then(setWindGrid);
    } else {
      setWindGrid(null);
      webViewRef.current?.injectJavaScript(`window.clearVelocity(); true;`);
    }
  }, [mapLat, mapLng]);

  const [wordModal, setWordModal] = useState<{ word: string; sentence: string } | null>(null);
  const wxTheme = getWxTheme(weather.code ?? 0);

  // Slice 24 future hours starting from the current hour
  const FUTURE = 24;
  const hourlyValues = (
    activeLayer === 'temperature' ? (weather.hourlyTemps ?? [])
    : activeLayer === 'wind'     ? (weather.hourlyWinds ?? [])
    : activeLayer === 'clouds'   ? (weather.hourlyClouds ?? [])
    : (weather.hourlyPrecipProb ?? [])
  ).slice(currentHour, currentHour + FUTURE);
  const showHourly = hourlyValues.length > 0;
  const showScrubber = false; // radar auto-plays silently; user controls via hourly scrubber

  // Shadow + border on OUTER wrapper (no overflow:hidden — that clips shadows on iOS)
  const cardStyle = {
    borderWidth: 0.5,
    borderColor: 'rgba(255,255,255,0.85)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 20,
    elevation: 20,
  } as const;

  return (
    <>
      {/* ── Inline strip ─────────────────────────────────────────── */}
      <View ref={stripRef} style={[
        styles.strip,
        { borderBottomColor: colors.borderLight },
        iPadLayout && { flexDirection: 'row', alignItems: 'flex-start', gap: 16 },
      ]}>
        {/* Text column — headline + phrase */}
        <View style={iPadLayout ? { flex: 1 } : undefined}>
          <View style={styles.stripTop}>
            <Text style={[styles.stripMeta, { color: colors.inkDark, fontFamily: fontFamily.bold, fontSize: fontSize.heading, lineHeight: fontSize.heading * 1.2 }]}>
              {headline.split(' ').map((word, i) => (
                <Text key={i} onPress={() => setWordModal({ word: word.replace(/[.,!?;:«»"]/g, ''), sentence: headline })}>
                  {word}{' '}
                </Text>
              ))}
            </Text>
            {/* Only show modal chevron on phone */}
            {!iPadLayout && (
              <TouchableOpacity onPress={openModal} activeOpacity={0.7} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={{ flexDirection: 'row', alignItems: 'center', paddingTop: 3 }}>
                <Ionicons name={iconName} size={18} color={iconColor} style={{ marginLeft: 6 }} />
                <Ionicons name="chevron-down-outline" size={14} color={colors.inkFaint} style={{ marginLeft: 2 }} />
              </TouchableOpacity>
            )}
          </View>
          <Text style={[styles.stripPhraseWord, { color: colors.inkDark, fontFamily: fontFamily.regular, fontSize: fontSize.body, lineHeight: fontSize.body * 1.65, textAlign: 'justify' }]}>
            {phrase.split(' ').map((word, i) => (
              <Text key={i} onPress={() => setWordModal({ word: word.replace(/[.,!?;:«»"]/g, ''), sentence: phrase })}>
                {word}{' '}
              </Text>
            ))}
          </Text>
        </View>

        {/* iPad right panel — compact weather card */}
        {iPadLayout && (
          <View style={[styles.iPadPanel, { backgroundColor: colors.card, borderColor: colors.borderMid }]}>
            <Ionicons name={iconName} size={40} color={iconColor} />
            <Text style={[styles.iPadTemp, { color: colors.inkDark, fontFamily: fontFamily.bold }]}>
              {Math.round(weather.temp)}°
            </Text>
            <Text style={[styles.iPadCity, { color: colors.inkFaint, fontFamily: fontFamily.regular }]} numberOfLines={1}>
              {weather.city}
            </Text>
            <View style={styles.iPadTodRow}>
              {(() => {
                const [amLbl, noonLbl, pmLbl] = TOD_LABELS[language] ?? TOD_LABELS.en!;
                const activeSlot = currentHour >= 5 && currentHour < 12 ? 0
                  : currentHour >= 12 && currentHour < 17 ? 1 : 2;
                return [
                  { hour: 7,  label: amLbl,   night: false },
                  { hour: 12, label: noonLbl, night: false },
                  { hour: 21, label: pmLbl,   night: true  },
                ].map(({ hour, label, night }, idx) => {
                  const active = idx === activeSlot;
                  const code = weather.hourlyCodes?.[hour] ?? weather.code ?? 0;
                  const icon = night ? codeToNightIcon(code) : codeToIcon(code);
                  const color = night ? codeToNightColor(code, isDark) : codeToColor(code);
                  return (
                    <View key={label} style={styles.iPadTodItem}>
                      <Ionicons name={icon} size={active ? 20 : 16} color={color} />
                      <Text style={{ fontSize: active ? 10 : 9, color: active ? colors.inkDark : colors.inkFaint, fontFamily: active ? fontFamily.bold : fontFamily.regular }}>{label}</Text>
                    </View>
                  );
                });
              })()}
            </View>
            {weather.hourlyTemps && weather.hourlyTemps.length > 0 && (
              <Text style={[styles.iPadHiLo, { color: colors.inkMid, fontFamily: fontFamily.regular }]}>
                {Math.round(highTemp)}° / {Math.round(lowTemp)}°
              </Text>
            )}
          </View>
        )}
      </View>

      {/* ── Modal — same style as streak ─────────────────────────── */}
      <Modal visible={modalVisible} transparent animationType="none" onRequestClose={closeModal}>
        <BlurView intensity={10} tint={isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} pointerEvents="none" />
        {/* Dismiss on tap OUTSIDE the card — Pressable sits behind the card in z-order */}
        <Pressable style={StyleSheet.absoluteFill} onPress={closeModal} />
        <View style={[styles.backdrop, { paddingTop: modalTop }]} pointerEvents="box-none">
          <Animated.View style={[styles.modalInner, { transform: [{ scale: scaleAnim }] }]} onStartShouldSetResponder={() => true}>

              {/* Top tile — date + city left, morning/noon/night icons right */}
              <View style={[styles.phraseOuter, { backgroundColor: colors.card, borderColor: colors.borderLight, borderWidth: StyleSheet.hairlineWidth, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.13, shadowRadius: 6, elevation: 3, flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 16 }]}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.inkFaint, fontFamily: fontFamily.regular, fontSize: 12, lineHeight: 16 }}>
                    {localizedDate(language)}
                  </Text>
                  <Text style={{ color: colors.inkDark, fontFamily: fontFamily.bold, fontSize: 18, lineHeight: 24 }} numberOfLines={1}>
                    {weather.city}
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', gap: 16, alignItems: 'center' }}>
                  {(() => {
                    const [amLbl, noonLbl, pmLbl] = TOD_LABELS[language] ?? TOD_LABELS.en!;
                    // Which slot is active based on current location hour
                    const activeSlot = currentHour >= 5 && currentHour < 12 ? 0
                      : currentHour >= 12 && currentHour < 17 ? 1
                      : 2;
                    return [
                      { hour: 7,  label: amLbl,   night: false },
                      { hour: 12, label: noonLbl, night: false },
                      { hour: 21, label: pmLbl,   night: true  },
                    ].map(({ hour, label, night }, idx) => {
                      const active = idx === activeSlot;
                      const code = weather.hourlyCodes?.[hour] ?? weather.code ?? 0;
                      const icon = night ? codeToNightIcon(code) : codeToIcon(code);
                      const color = night ? codeToNightColor(code, isDark) : codeToColor(code);
                      return (
                        <View key={label} style={{ alignItems: 'center', gap: 4 }}>
                          <Ionicons name={icon} size={active ? 26 : 20} color={color} style={night ? { opacity: 0.75 } : undefined} />
                          <Text style={{ fontSize: active ? 11 : 9, color: active ? colors.inkDark : colors.inkFaint, fontFamily: active ? fontFamily.bold : fontFamily.regular }}>{label}</Text>
                        </View>
                      );
                    });
                  })()}
                </View>
              </View>

              <View style={{ height: 6 }} />

              {/* Map card outer — has shadow (no overflow:hidden) */}
              <View style={[styles.mapOuter, cardStyle, { height: MAP_H }]}>
                {/* Inner clip — overflow:hidden clips WebView to border radius */}
                <View style={[StyleSheet.absoluteFill, styles.mapClip, { backgroundColor: glassAvailable ? 'transparent' : colors.card }]}>
                  {glassAvailable && <GlassSurface cornerRadius={CARD_RADIUS} colorScheme={isDark ? 'dark' : 'light'} />}
                  <WebView
                    ref={webViewRef}
                    source={{ html: mapHtml, baseUrl: 'https://bilinguist.app' }}
                    style={StyleSheet.absoluteFill}
                    scrollEnabled={false}
                    bounces={false}
                    showsVerticalScrollIndicator={false}
                    showsHorizontalScrollIndicator={false}
                    originWhitelist={['*']}
                    onMessage={e => {
                      try {
                        const msg = JSON.parse(e.nativeEvent.data);
                        if (msg.type === 'ready') {
                          setMapReady(true);
                          // Inject immediately — effect has one async hop; this fires right away
                          if (activeLayer === 'precipitation' && frames.length > 0) {
                            const safeIdx = Math.min(frameIdx, frames.length - 1);
                            const url = rainviewerTileUrl(frames[safeIdx].path);
                            webViewRef.current?.injectJavaScript(`window.setLayer('${url}',6); true;`);
                          } else if (activeLayer === 'clouds') {
                            const url = owmTileUrl('clouds');
                            webViewRef.current?.injectJavaScript(`window.setLayer('${url}'); true;`);
                          }
                        } else if (msg.type === 'mapMove') {
                          setMapCenter({ lat: msg.lat, lng: msg.lng });
                        }
                      } catch {}
                    }}
                  />
                </View>


                {/* Top-left data badge — temp / high-low / rain / wind */}
                {(weather.hourlyTemps?.length ?? 0) > 0 && (
                  <DataBadge
                    tempValues={(weather.hourlyTemps ?? []).slice(currentHour, currentHour + 24)}
                    rainValues={(weather.hourlyPrecipProb ?? []).slice(currentHour, currentHour + 24)}
                    windValues={(weather.hourlyWinds ?? []).slice(currentHour, currentHour + 24)}
                    selectedHour={selectedHour}
                    accentColor={MAP_STYLE_ACCENT[mapStyleKey]}
                  />
                )}

                {/* Layer toggle */}
                <LayerToggle activeLayer={activeLayer} hasOwmKey={hasOwmKey} labels={labels} onSelect={handleLayerSelect} />

                {/* Precipitation scrubber */}
                {showScrubber && (
                  <View style={styles.scrubberOverlay}>
                    <Scrubber frames={frames} frameIdx={frameIdx} isPlaying={isPlaying}
                      onScrub={idx => { setIsPlaying(false); setFrameIdx(idx); }}
                      onTogglePlay={() => setIsPlaying(p => !p)} />
                  </View>
                )}

                {/* Time scrubber — no graph, just the drag handle + time labels */}
                {showHourly && (
                  <View style={styles.scrubberOverlay}>
                    <HourlyGraph
                      values={hourlyValues}
                      layer={activeLayer as StaticLayer}
                      selectedHour={selectedHour}
                      onHourChange={setSelectedHour}
                      startHour={currentHour}
                    />
                  </View>
                )}
              </View>


          </Animated.View>
        </View>
        <SafeAreaView />
      </Modal>
      {/* Word definition popup — same as article words */}
      {wordModal && (
        <WordPopup
          word={wordModal.word}
          sentence={wordModal.sentence}
          language={language}
          level={level}
          onClose={() => setWordModal(null)}
        />
      )}
    </>
  );
});

const CARD_RADIUS = 20;

const styles = StyleSheet.create({
  strip:          { paddingHorizontal: 18, paddingTop: 10, paddingBottom: 14 },
  stripTop:       { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 6 },
  stripMeta:      { flex: 1, fontSize: 13 },
  stripPhraseRow: { flexDirection: 'row', flexWrap: 'wrap' },
  stripPhraseWord:{ },

  backdrop:   { flex: 1, backgroundColor: 'transparent', justifyContent: 'flex-start', alignItems: 'center', paddingHorizontal: 16 },
  modalInner: { width: '100%' },

  // Phrase card — NO overflow:hidden so shadow renders; content doesn't overflow the radius anyway
  phraseOuter: { borderRadius: CARD_RADIUS },
  phraseWords: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-start' }, // strip only
  phraseText:  { fontSize: 15, lineHeight: 26, textAlign: 'justify' },

  // Map card outer — NO overflow:hidden so shadow renders
  mapOuter: { borderRadius: CARD_RADIUS },
  // Map card inner — overflow:hidden clips WebView to border radius
  mapClip:  { borderRadius: CARD_RADIUS, overflow: 'hidden' },

  scrubberOverlay: { position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 10, borderBottomLeftRadius: CARD_RADIUS, borderBottomRightRadius: CARD_RADIUS, overflow: 'hidden' },

  // iPad inline weather panel (right column)
  iPadPanel:   { width: 130, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', paddingVertical: 12, paddingHorizontal: 10, gap: 4 },
  iPadTemp:    { fontSize: 28, lineHeight: 32 },
  iPadCity:    { fontSize: 11, textAlign: 'center', maxWidth: 110 },
  iPadTodRow:  { flexDirection: 'row', gap: 6, marginTop: 4 },
  iPadTodItem: { alignItems: 'center', gap: 2 },
  iPadHiLo:    { fontSize: 11, marginTop: 4 },
});
