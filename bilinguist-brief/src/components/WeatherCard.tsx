import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  PanResponder,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Dimensions,
} from 'react-native';
import WebView from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import { GlassSurface, glassAvailable } from './GlassSurface';
import { useTheme } from '../hooks/useTheme';
import { Spacing } from '../theme';
import type { WeatherData, RainviewerFrame } from '../services/weather';
import { fetchRainviewerFrames } from '../services/weather';
import { getWeatherPhrase, LAYER_LABELS } from '../services/weatherPhrases';
import type { LanguageCode } from '../store/useSettingsStore';

const { width: SW } = Dimensions.get('window');
const CARD_H_MAP = Math.round((SW - 32) * 0.85); // ~85% of card width → near-square
const OWM_KEY = (process.env.EXPO_PUBLIC_OWM_KEY ?? '').trim();

type Layer = 'precipitation' | 'temperature' | 'wind' | 'clouds';

const OWM_PARAM: Record<Exclude<Layer, 'precipitation'>, string> = {
  temperature: 'temp_new',
  wind:        'wind_new',
  clouds:      'clouds_new',
};

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
    body,html{width:100%;height:100%;background:#e8edf2;overflow:hidden}
    #map{width:100%;height:100vh}
    .leaflet-control-attribution{display:none!important}
    .leaflet-control-zoom{display:none!important}
  </style>
</head>
<body>
<div id="map"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
var map = L.map('map',{
  center:[${lat},${lng}],
  zoom:7,
  dragging:false,
  touchZoom:false,
  scrollWheelZoom:false,
  doubleClickZoom:false,
  zoomControl:false,
  attributionControl:false
});
L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',{maxZoom:19}).addTo(map);

// User location pin
L.circleMarker([${lat},${lng}],{
  radius:9,fillColor:'#2563EB',fillOpacity:1,color:'#fff',weight:2.5
}).addTo(map);

var weatherLayer=null;
function setLayer(url){
  if(weatherLayer){map.removeLayer(weatherLayer);weatherLayer=null;}
  if(url){
    weatherLayer=L.tileLayer(url,{opacity:0.7,maxZoom:19});
    weatherLayer.addTo(map);
  }
}
window.setLayer=setLayer;
window.setCenter=function(lat,lng){map.setView([lat,lng],map.getZoom())};
window.addEventListener('load',function(){
  if(window.ReactNativeWebView){
    window.ReactNativeWebView.postMessage(JSON.stringify({type:'ready'}));
  }
});
</script>
</body>
</html>`;
}

function formatHour(unixSec: number): string {
  const d = new Date(unixSec * 1000);
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
}

// ── Scrubber ─────────────────────────────────────────────────────────────────

interface ScrubberProps {
  frames: RainviewerFrame[];
  frameIdx: number;
  isPlaying: boolean;
  onScrub: (idx: number) => void;
  onTogglePlay: () => void;
  colors: any;
  fontFamily: any;
}

function Scrubber({ frames, frameIdx, isPlaying, onScrub, onTogglePlay, colors, fontFamily }: ScrubberProps) {
  const trackWidth = useRef(0);

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

  const nowIdx = useMemo(() => {
    const nowSec = Date.now() / 1000;
    let best = 0;
    frames.forEach((f, i) => { if (f.time <= nowSec) best = i; });
    return best;
  }, [frames]);

  // Label positions: start, 1/4, now, 3/4, end
  const labelAt = (idx: number) => frames.length > 1 ? (idx / (frames.length - 1)) * 100 : 0;
  const thumbPct = frames.length > 1 ? (frameIdx / (frames.length - 1)) * 100 : 0;

  return (
    <View style={scrubStyles.container}>
      {/* Play / Pause */}
      <TouchableOpacity style={scrubStyles.playBtn} onPress={onTogglePlay} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <Ionicons name={isPlaying ? 'pause' : 'play'} size={14} color="#fff" />
      </TouchableOpacity>

      {/* Track */}
      <View
        style={scrubStyles.track}
        onLayout={e => { trackWidth.current = e.nativeEvent.layout.width; }}
        {...panResponder.panHandlers}
      >
        {/* Fill */}
        <View style={[scrubStyles.fill, { width: `${thumbPct}%` }]} />

        {/* Now marker */}
        {frames.length > 0 && (
          <View style={[scrubStyles.nowMark, { left: `${labelAt(nowIdx)}%` }]} />
        )}

        {/* Thumb */}
        <View style={[scrubStyles.thumb, { left: `${thumbPct}%` }]} />

        {/* Time labels */}
        {frames.length > 0 && [0, nowIdx, frames.length - 1].map((idx, i) => (
          <Text
            key={i}
            style={[scrubStyles.label, { left: `${labelAt(idx)}%`, color: idx === nowIdx ? '#fff' : 'rgba(255,255,255,0.7)' }]}
          >
            {idx === nowIdx ? 'now' : formatHour(frames[idx].time)}
          </Text>
        ))}
      </View>
    </View>
  );
}

const scrubStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 10,
  },
  playBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  track: {
    flex: 1,
    height: 28,
    justifyContent: 'center',
    position: 'relative',
  },
  fill: {
    position: 'absolute',
    height: 3,
    backgroundColor: '#fff',
    borderRadius: 1.5,
    top: '50%',
    marginTop: -1.5,
  },
  nowMark: {
    position: 'absolute',
    width: 2,
    height: 10,
    backgroundColor: '#93C5FD',
    borderRadius: 1,
    top: '50%',
    marginTop: -5,
    marginLeft: -1,
  },
  thumb: {
    position: 'absolute',
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#fff',
    top: '50%',
    marginTop: -7,
    marginLeft: -7,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 2,
    elevation: 3,
  },
  label: {
    position: 'absolute',
    fontSize: 9,
    fontWeight: '600',
    top: '50%',
    marginTop: 8,
    transform: [{ translateX: -12 }],
  },
});

// ── Layer toggle ──────────────────────────────────────────────────────────────

interface LayerToggleProps {
  activeLayer: Layer;
  hasOwmKey: boolean;
  labels: { precipitation: string; temperature: string; wind: string; clouds: string };
  onSelect: (l: Layer) => void;
}

const LAYER_ICONS: Record<Layer, React.ComponentProps<typeof Ionicons>['name']> = {
  precipitation: 'rainy-outline',
  temperature:   'thermometer-outline',
  wind:          'thunderstorm-outline',
  clouds:        'cloudy-outline',
};

function LayerToggle({ activeLayer, hasOwmKey, labels, onSelect }: LayerToggleProps) {
  const [open, setOpen] = useState(false);
  const layers: Layer[] = hasOwmKey
    ? ['precipitation', 'temperature', 'wind', 'clouds']
    : ['precipitation'];

  return (
    <View style={ltStyles.wrapper}>
      <TouchableOpacity style={ltStyles.btn} onPress={() => setOpen(o => !o)} activeOpacity={0.8}>
        <Ionicons name="layers-outline" size={16} color="#1a1a1a" />
      </TouchableOpacity>
      {open && (
        <View style={ltStyles.menu}>
          {layers.map(layer => (
            <TouchableOpacity
              key={layer}
              style={ltStyles.menuItem}
              onPress={() => { onSelect(layer); setOpen(false); }}
              activeOpacity={0.7}
            >
              <Ionicons
                name={LAYER_ICONS[layer]}
                size={14}
                color={activeLayer === layer ? '#2563EB' : '#555'}
                style={{ width: 20 }}
              />
              <Text style={[ltStyles.menuText, activeLayer === layer && ltStyles.menuTextActive]}>
                {labels[layer]}
              </Text>
              {activeLayer === layer && (
                <Ionicons name="checkmark" size={13} color="#2563EB" style={{ marginLeft: 4 }} />
              )}
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

const ltStyles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    top: 10,
    right: 10,
    alignItems: 'flex-end',
    zIndex: 10,
  },
  btn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 4,
  },
  menu: {
    marginTop: 6,
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderRadius: 12,
    paddingVertical: 4,
    minWidth: 160,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  menuText: {
    fontSize: 14,
    color: '#333',
    flex: 1,
  },
  menuTextActive: {
    color: '#2563EB',
    fontWeight: '600',
  },
});

// ── WeatherCard ───────────────────────────────────────────────────────────────

interface WeatherCardProps {
  weather: WeatherData;
  language: LanguageCode;
  level: string;
}

export function WeatherCard({ weather, language, level }: WeatherCardProps) {
  const { colors, fontFamily } = useTheme();

  const [activeLayer, setActiveLayer]   = useState<Layer>('precipitation');
  const [frames, setFrames]             = useState<RainviewerFrame[]>([]);
  const [frameIdx, setFrameIdx]         = useState(0);
  const [isPlaying, setIsPlaying]       = useState(true);
  const [mapReady, setMapReady]         = useState(false);

  const webViewRef = useRef<WebView>(null);
  const playRef    = useRef<ReturnType<typeof setInterval> | null>(null);

  const phrase  = getWeatherPhrase(weather.code, language, level);
  const labels  = LAYER_LABELS[language] ?? LAYER_LABELS.en!;
  const hasOwmKey = OWM_KEY.length > 0;
  const mapHtml = useMemo(() => buildMapHtml(weather.latitude, weather.longitude), [weather.latitude, weather.longitude]);

  // Fetch RainViewer frames on mount
  useEffect(() => {
    fetchRainviewerFrames().then(f => {
      if (!f.length) return;
      setFrames(f);
      // Position scrubber at the most recent past frame ("now")
      const nowSec = Date.now() / 1000;
      let nowIdx = 0;
      f.forEach((fr, i) => { if (fr.time <= nowSec) nowIdx = i; });
      setFrameIdx(nowIdx);
    });
  }, []);

  // Apply current tile to the WebView whenever frame, layer, or map-ready state changes
  const applyTile = useCallback((layer: Layer, idx: number, ready: boolean) => {
    if (!ready) return;
    let url = '';
    if (layer === 'precipitation' && frames.length > 0) {
      url = rainviewerTileUrl(frames[idx].path);
    } else {
      url = owmTileUrl(layer);
    }
    webViewRef.current?.injectJavaScript(`window.setLayer('${url}'); true;`);
  }, [frames]);

  useEffect(() => { applyTile(activeLayer, frameIdx, mapReady); }, [activeLayer, frameIdx, mapReady, applyTile]);

  // Auto-play for precipitation
  useEffect(() => {
    if (playRef.current) clearInterval(playRef.current);
    if (isPlaying && activeLayer === 'precipitation' && frames.length > 0) {
      playRef.current = setInterval(() => {
        setFrameIdx(i => (i + 1) % frames.length);
      }, 700);
    }
    return () => { if (playRef.current) clearInterval(playRef.current); };
  }, [isPlaying, activeLayer, frames.length]);

  const handleLayerSelect = useCallback((layer: Layer) => {
    setActiveLayer(layer);
    if (layer !== 'precipitation') setIsPlaying(false);
    else setIsPlaying(true);
  }, []);

  const handleScrub = useCallback((idx: number) => {
    setIsPlaying(false);
    setFrameIdx(idx);
  }, []);

  const showScrubber = activeLayer === 'precipitation' && frames.length > 0;

  return (
    <View style={styles.wrapper}>
      {/* ── Top thin box: phrase ───────────────────────────────────── */}
      <View
        style={[
          styles.phraseCard,
          { backgroundColor: glassAvailable ? 'transparent' : colors.surface },
        ]}
      >
        {glassAvailable && <GlassSurface cornerRadius={20} />}
        <Text
          style={[styles.phraseText, { color: colors.inkDark, fontFamily: fontFamily.italic }]}
          numberOfLines={2}
          adjustsFontSizeToFit
          minimumFontScale={0.8}
        >
          {phrase}
        </Text>
      </View>

      {/* ── Bottom large box: map ──────────────────────────────────── */}
      <View
        style={[
          styles.mapCard,
          { backgroundColor: glassAvailable ? 'transparent' : colors.card, height: CARD_H_MAP },
        ]}
      >
        {glassAvailable && <GlassSurface cornerRadius={20} />}

        {/* Map — clipped to card radius */}
        <View style={styles.mapClip}>
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
                if (msg.type === 'ready') setMapReady(true);
              } catch {}
            }}
          />

          {/* Layer toggle – top right */}
          <LayerToggle
            activeLayer={activeLayer}
            hasOwmKey={hasOwmKey}
            labels={labels}
            onSelect={handleLayerSelect}
          />

          {/* Hourly scrubber – bottom overlay */}
          {showScrubber && (
            <View style={styles.scrubberOverlay}>
              <Scrubber
                frames={frames}
                frameIdx={frameIdx}
                isPlaying={isPlaying}
                onScrub={handleScrub}
                onTogglePlay={() => setIsPlaying(p => !p)}
                colors={colors}
                fontFamily={fontFamily}
              />
            </View>
          )}
        </View>
      </View>
    </View>
  );
}

const CARD_RADIUS = 20;

const styles = StyleSheet.create({
  wrapper: {
    marginHorizontal: 16,
    marginBottom: Spacing.lg,
    gap: 10,
  },

  // Top phrase card — same glass style as streak modal
  phraseCard: {
    borderRadius: CARD_RADIUS,
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.85)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 20,
    elevation: 8,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  phraseText: {
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
  },

  // Large map card
  mapCard: {
    borderRadius: CARD_RADIUS,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.85)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 20,
    elevation: 8,
    overflow: 'hidden',
  },
  mapClip: {
    flex: 1,
    borderRadius: CARD_RADIUS,
    overflow: 'hidden',
  },
  scrubberOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderBottomLeftRadius: CARD_RADIUS,
    borderBottomRightRadius: CARD_RADIUS,
  },
});
