import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Modal,
  PanResponder,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import WebView from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import { GlassSurface, glassAvailable } from './GlassSurface';
import { useTheme } from '../hooks/useTheme';
import type { WeatherData, RainviewerFrame } from '../services/weather';
import { fetchRainviewerFrames, WEATHER_IN } from '../services/weather';
import { getWeatherPhrase, LAYER_LABELS } from '../services/weatherPhrases';
import type { LanguageCode } from '../store/useSettingsStore';

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

function codeToIcon(code: number): React.ComponentProps<typeof Ionicons>['name'] {
  if (code === 0)                      return 'sunny-outline';
  if (code <= 2)                       return 'partly-sunny-outline';
  if (code === 3)                      return 'cloudy-outline';
  if (code <= 48)                      return 'cloud-outline';
  if (code <= 65 || (code >= 80 && code <= 82)) return 'rainy-outline';
  if (code <= 86)                      return 'snow-outline';
  if (code >= 95)                      return 'thunderstorm-outline';
  return 'thermometer-outline';
}

function owmTileUrl(layer: Layer): string {
  if (layer === 'precipitation' || !OWM_KEY) return '';
  return `https://tile.openweathermap.org/map/${OWM_PARAM[layer]}/{z}/{x}/{y}.png?appid=${OWM_KEY}`;
}

function rainviewerTileUrl(path: string): string {
  return `https://tilecache.rainviewer.com${path}/512/{z}/{x}/{y}/6/1_1.png`;
}

function buildMapHtml(lat: number, lng: number): string {
  return `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body,html{width:100%;height:100%;overflow:hidden}
#map{width:100%;height:100vh}
.leaflet-control-attribution,.leaflet-control-zoom{display:none!important}
/* Pulsing location dot */
.loc-wrap{position:relative;width:26px;height:26px}
.loc-dot{
  position:absolute;width:14px;height:14px;border-radius:50%;
  background:#3B82F6;border:2.5px solid #fff;
  top:6px;left:6px;z-index:2;
  box-shadow:0 2px 6px rgba(59,130,246,0.6);
}
.loc-ring{
  position:absolute;width:26px;height:26px;border-radius:50%;
  background:rgba(59,130,246,0.25);
  animation:locpulse 2s ease-out infinite;z-index:1;
}
@keyframes locpulse{
  0%{transform:scale(0.4);opacity:1}
  100%{transform:scale(1.6);opacity:0}
}
</style>
</head>
<body>
<div id="map"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
var map=L.map('map',{
  center:[${lat},${lng}],zoom:7,
  dragging:false,touchZoom:false,scrollWheelZoom:false,
  doubleClickZoom:false,zoomControl:false,attributionControl:false
});
/* Voyager — warm, colourful base map */
L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',{maxZoom:19}).addTo(map);
/* Pulsing location marker */
var locIcon=L.divIcon({
  className:'',
  html:'<div class="loc-wrap"><div class="loc-ring"></div><div class="loc-dot"></div></div>',
  iconSize:[26,26],iconAnchor:[13,13]
});
L.marker([${lat},${lng}],{icon:locIcon,interactive:false}).addTo(map);
var weatherLayer=null;
window.setLayer=function(url){
  if(weatherLayer){map.removeLayer(weatherLayer);weatherLayer=null;}
  if(url){weatherLayer=L.tileLayer(url,{opacity:0.75,maxZoom:19});weatherLayer.addTo(map);}
};
window.addEventListener('load',function(){
  if(window.ReactNativeWebView)window.ReactNativeWebView.postMessage(JSON.stringify({type:'ready'}));
});
</script>
</body>
</html>`;
}

function formatHour(unixSec: number): string {
  const d = new Date(unixSec * 1000);
  return `${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}`;
}

// ── Hourly graph (temperature / wind / clouds) ────────────────────────────────

type StaticLayer = 'temperature' | 'wind' | 'clouds';

function tempBarColor(v: number): string {
  if (v < 0)   return '#818CF8';
  if (v < 10)  return '#60A5FA';
  if (v < 18)  return '#34D399';
  if (v < 28)  return '#FBBF24';
  return '#EF4444';
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

function HourlyGraph({ values, layer }: { values: number[]; layer: StaticLayer }) {
  if (!values.length) return null;
  const currentHour = new Date().getHours();
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(max - min, 1);
  const BAR_H = 36;

  function barH(v: number) { return Math.max(3, Math.round(((v - min) / range) * BAR_H)); }
  function barColor(v: number) {
    if (layer === 'temperature') return tempBarColor(v);
    if (layer === 'wind') return windBarColor(v);
    return cloudBarColor(v);
  }
  function fmt(v: number) {
    if (layer === 'temperature') return `${v}°`;
    if (layer === 'wind') return `${v}`;
    return `${v}%`;
  }
  const unit = layer === 'temperature' ? '°C' : layer === 'wind' ? 'km/h' : '% cloud';
  const current = values[Math.min(currentHour, values.length - 1)] ?? 0;
  const todayMax = max;
  const todayMin = min;

  return (
    <View style={hgStyles.container}>
      <View style={hgStyles.header}>
        <Text style={hgStyles.currentVal}>{fmt(current)} <Text style={hgStyles.unit}>{unit}</Text></Text>
        <Text style={hgStyles.minmax}>↑{fmt(todayMax)}  ↓{fmt(todayMin)}</Text>
      </View>
      <View style={hgStyles.barsRow}>
        {values.map((v, i) => (
          <View key={i} style={hgStyles.barCol}>
            <View style={[
              hgStyles.bar,
              { height: barH(v), backgroundColor: barColor(v) },
              i === currentHour && hgStyles.barCurrent,
            ]} />
          </View>
        ))}
      </View>
      <View style={hgStyles.timeRow}>
        {[0, 6, 12, 18, 23].map(h => (
          <Text key={h} style={[hgStyles.timeLbl, { left: `${(h / 23) * 100}%` as any }]}>
            {h === 0 ? '12a' : h === 6 ? '6a' : h === 12 ? '12p' : h === 18 ? '6p' : '11p'}
          </Text>
        ))}
      </View>
    </View>
  );
}

const hgStyles = StyleSheet.create({
  container:  { paddingHorizontal: 12, paddingTop: 8, paddingBottom: 4 },
  header:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 },
  currentVal: { fontSize: 13, fontWeight: '700', color: '#fff' },
  unit:       { fontSize: 10, fontWeight: '400', color: 'rgba(255,255,255,0.65)' },
  minmax:     { fontSize: 10, color: 'rgba(255,255,255,0.7)', letterSpacing: 0.2 },
  barsRow:    { flexDirection: 'row', alignItems: 'flex-end', height: 40, gap: 1 },
  barCol:     { flex: 1, alignItems: 'center', justifyContent: 'flex-end' },
  bar:        { width: '85%', borderRadius: 2, opacity: 0.6 },
  barCurrent: { opacity: 1, borderWidth: 1, borderColor: '#fff' },
  timeRow:    { position: 'relative', height: 14, marginTop: 2 },
  timeLbl:    { position: 'absolute', fontSize: 8, color: 'rgba(255,255,255,0.55)', transform: [{ translateX: -10 }] },
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
  label:     { position: 'absolute', fontSize: 9, fontWeight: '600', top: '50%', marginTop: 8, transform: [{ translateX: -12 }] },
});

// ── Layer toggle ──────────────────────────────────────────────────────────────

function LayerToggle({ activeLayer, hasOwmKey, labels, onSelect }: {
  activeLayer: Layer;
  hasOwmKey: boolean;
  labels: { precipitation: string; temperature: string; wind: string; clouds: string };
  onSelect: (l: Layer) => void;
}) {
  const [open, setOpen] = useState(false);
  const layers: Layer[] = hasOwmKey
    ? ['precipitation', 'temperature', 'wind', 'clouds']
    : ['precipitation'];

  return (
    <View style={ltStyles.wrapper}>
      <TouchableOpacity style={ltStyles.btn} onPress={() => setOpen(o => !o)} activeOpacity={0.8}>
        <Ionicons name="layers-outline" size={15} color="#1a1a1a" />
      </TouchableOpacity>
      {open && (
        <View style={ltStyles.menu}>
          {layers.map(layer => (
            <TouchableOpacity key={layer} style={ltStyles.item} activeOpacity={0.7}
              onPress={() => { onSelect(layer); setOpen(false); }}>
              <Ionicons name={LAYER_ICONS[layer]} size={13} color={activeLayer === layer ? '#3B82F6' : '#555'} style={{ width: 18 }} />
              <Text style={[ltStyles.itemText, activeLayer === layer && ltStyles.itemActive]}>{labels[layer]}</Text>
              {activeLayer === layer && <Ionicons name="checkmark" size={12} color="#3B82F6" />}
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

const ltStyles = StyleSheet.create({
  wrapper:    { position: 'absolute', top: 10, right: 10, alignItems: 'flex-end', zIndex: 20 },
  btn:        { width: 32, height: 32, borderRadius: 9, backgroundColor: 'rgba(255,255,255,0.92)', alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.12, shadowRadius: 4, elevation: 5 },
  menu:       { marginTop: 5, backgroundColor: 'rgba(255,255,255,0.96)', borderRadius: 12, paddingVertical: 4, minWidth: 155, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 12, elevation: 10 },
  item:       { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10 },
  itemText:   { fontSize: 13, color: '#333', flex: 1 },
  itemActive: { color: '#3B82F6', fontWeight: '600' },
});

// ── WeatherCard ───────────────────────────────────────────────────────────────

interface WeatherCardProps {
  weather: WeatherData;
  language: LanguageCode;
  level: string;
}

export function WeatherCard({ weather, language, level }: WeatherCardProps) {
  const { colors, fontFamily } = useTheme();

  const [modalVisible, setModalVisible] = useState(false);
  const [activeLayer, setActiveLayer]   = useState<Layer>('precipitation');
  const [frames, setFrames]             = useState<RainviewerFrame[]>([]);
  const [frameIdx, setFrameIdx]         = useState(0);
  const [isPlaying, setIsPlaying]       = useState(true);
  const [mapReady, setMapReady]         = useState(false);

  const webViewRef = useRef<WebView>(null);
  const playRef    = useRef<ReturnType<typeof setInterval> | null>(null);
  const scaleAnim  = useRef(new Animated.Value(0.88)).current;

  const phrase      = getWeatherPhrase(weather.code, language, level);
  const labels      = LAYER_LABELS[language] ?? LAYER_LABELS.en!;
  const hasOwmKey   = OWM_KEY.length > 0;
  const iconName    = codeToIcon(weather.code ?? 0);
  const preposition = WEATHER_IN[language] ?? 'in';

  const mapLat  = weather.latitude  ?? 51.5074;
  const mapLng  = weather.longitude ?? -0.1278;
  const mapHtml = useMemo(() => buildMapHtml(mapLat, mapLng), [mapLat, mapLng]);

  // Fetch RainViewer frames once
  useEffect(() => {
    fetchRainviewerFrames().then(f => {
      if (!f.length) return;
      setFrames(f);
      const nowSec = Date.now() / 1000;
      let nowIdx = 0;
      f.forEach((fr, i) => { if (fr.time <= nowSec) nowIdx = i; });
      setFrameIdx(nowIdx);
    });
  }, []);

  // Apply tile to WebView
  const applyTile = useCallback((layer: Layer, idx: number, ready: boolean) => {
    if (!ready) return;
    const url = layer === 'precipitation' && frames.length > 0
      ? rainviewerTileUrl(frames[idx].path)
      : owmTileUrl(layer);
    webViewRef.current?.injectJavaScript(`window.setLayer('${url}'); true;`);
  }, [frames]);

  useEffect(() => { applyTile(activeLayer, frameIdx, mapReady); }, [activeLayer, frameIdx, mapReady, applyTile]);

  // Auto-play (precipitation only — OWM tiles have no time dimension)
  useEffect(() => {
    if (playRef.current) clearInterval(playRef.current);
    if (isPlaying && activeLayer === 'precipitation' && frames.length > 0) {
      playRef.current = setInterval(() => setFrameIdx(i => (i + 1) % frames.length), 700);
    }
    return () => { if (playRef.current) clearInterval(playRef.current); };
  }, [isPlaying, activeLayer, frames.length]);

  function openModal() {
    setModalVisible(true);
    scaleAnim.setValue(0.88);
    Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, tension: 200, friction: 16 }).start();
  }

  function closeModal() {
    Animated.timing(scaleAnim, { toValue: 0.88, duration: 160, useNativeDriver: true })
      .start(() => setModalVisible(false));
  }

  const handleLayerSelect = useCallback((layer: Layer) => {
    setActiveLayer(layer);
    setIsPlaying(layer === 'precipitation');
  }, []);

  const showScrubber  = activeLayer === 'precipitation' && frames.length > 0;
  const hourlyValues  = activeLayer === 'temperature' ? (weather.hourlyTemps ?? [])
                      : activeLayer === 'wind'        ? (weather.hourlyWinds ?? [])
                      : activeLayer === 'clouds'      ? (weather.hourlyClouds ?? [])
                      : [];
  const showHourly = activeLayer !== 'precipitation' && hourlyValues.length > 0;

  // Shared glass card border/shadow — mirrors streak modal
  const cardStyle = {
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.85)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.20,
    shadowRadius: 40,
    elevation: 20,
  } as const;

  return (
    <>
      {/* ── Inline strip ─────────────────────────────────────────── */}
      <TouchableOpacity
        style={[styles.strip, { borderBottomColor: colors.borderLight }]}
        onPress={openModal}
        activeOpacity={0.7}
      >
        <View style={styles.stripRow}>
          <Ionicons name={iconName} size={13} color={colors.inkFaint} style={styles.stripIcon} />
          <Text style={[styles.stripText, { color: colors.inkFaint, fontFamily: fontFamily.italic }]}>
            {`${weather.greeting} — ${weather.temp}°C, ${weather.description} ${preposition} ${weather.city}`}
          </Text>
        </View>
      </TouchableOpacity>

      {/* ── Modal — same style as streak ─────────────────────────── */}
      <Modal visible={modalVisible} transparent animationType="none" onRequestClose={closeModal}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={closeModal}>
          <Animated.View style={[styles.modalInner, { transform: [{ scale: scaleAnim }] }]}>
            <TouchableOpacity activeOpacity={1} onPress={() => {}}>

              {/* Phrase card — thin */}
              <View style={[styles.phraseCard, cardStyle, { backgroundColor: glassAvailable ? 'transparent' : colors.surface }]}>
                {glassAvailable && <GlassSurface cornerRadius={26} />}
                <Text
                  style={[styles.phraseText, { color: colors.inkDark, fontFamily: fontFamily.italic }]}
                  numberOfLines={2}
                  adjustsFontSizeToFit
                  minimumFontScale={0.82}
                >
                  {phrase}
                </Text>
              </View>

              <View style={{ height: 10 }} />

              {/* Map card — large */}
              {/*
                The WebView is rendered first (fills card via absoluteFill).
                LayerToggle + Scrubber are rendered AFTER it in the tree so they
                sit on top in z-order and receive touches before the WebView.
              */}
              <View style={[styles.mapCard, cardStyle, { backgroundColor: glassAvailable ? 'transparent' : colors.card, height: MAP_H }]}>
                {glassAvailable && <GlassSurface cornerRadius={26} />}

                <WebView
                  ref={webViewRef}
                  source={{ html: mapHtml, baseUrl: 'https://bilinguist.app' }}
                  style={[StyleSheet.absoluteFill, { borderRadius: 26 }]}
                  scrollEnabled={false}
                  bounces={false}
                  showsVerticalScrollIndicator={false}
                  showsHorizontalScrollIndicator={false}
                  originWhitelist={['*']}
                  onMessage={e => {
                    try {
                      const msg = JSON.parse(e.nativeEvent.data);
                      if (msg.type === 'ready') setMapReady(true);
                    } catch {}
                  }}
                />

                {/* Layer toggle — rendered after WebView → on top */}
                <LayerToggle
                  activeLayer={activeLayer}
                  hasOwmKey={hasOwmKey}
                  labels={labels}
                  onSelect={handleLayerSelect}
                />

                {/* Precipitation scrubber — rendered after WebView → receives gestures */}
                {showScrubber && (
                  <View style={styles.scrubberOverlay}>
                    <Scrubber
                      frames={frames}
                      frameIdx={frameIdx}
                      isPlaying={isPlaying}
                      onScrub={idx => { setIsPlaying(false); setFrameIdx(idx); }}
                      onTogglePlay={() => setIsPlaying(p => !p)}
                    />
                  </View>
                )}

                {/* Hourly data graph for temperature / wind / clouds */}
                {showHourly && (
                  <View style={styles.scrubberOverlay}>
                    <HourlyGraph values={hourlyValues} layer={activeLayer as StaticLayer} />
                  </View>
                )}
              </View>

            </TouchableOpacity>
          </Animated.View>
        </TouchableOpacity>
        <SafeAreaView />
      </Modal>
    </>
  );
}

const CARD_RADIUS = 26;

const styles = StyleSheet.create({
  strip:    { paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, alignItems: 'center' },
  stripRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  stripIcon:{ marginTop: 1 },
  stripText:{ fontSize: 13, textAlign: 'center', lineHeight: 18 },

  backdrop:   { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 28 },
  modalInner: { width: '100%' },

  phraseCard: { borderRadius: CARD_RADIUS, paddingVertical: 14, paddingHorizontal: 24, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  phraseText: { fontSize: 15, textAlign: 'center', lineHeight: 22 },

  mapCard:        { borderRadius: CARD_RADIUS, overflow: 'hidden' },
  scrubberOverlay:{ position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.36)', borderBottomLeftRadius: CARD_RADIUS, borderBottomRightRadius: CARD_RADIUS, zIndex: 10 },
});
