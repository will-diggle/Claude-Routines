import React from 'react';
import { View, StyleSheet } from 'react-native';

function FlagInterior({ code, size }: { code: string; size: number }) {
  switch (code) {
    case 'fr':
      return (
        <View style={{ flex: 1, flexDirection: 'row' }}>
          <View style={{ flex: 1, backgroundColor: '#002395' }} />
          <View style={{ flex: 1, backgroundColor: '#FFFFFF' }} />
          <View style={{ flex: 1, backgroundColor: '#ED2939' }} />
        </View>
      );
    case 'de':
      return (
        <View style={{ flex: 1, flexDirection: 'column' }}>
          <View style={{ flex: 1, backgroundColor: '#000000' }} />
          <View style={{ flex: 1, backgroundColor: '#DD0000' }} />
          <View style={{ flex: 1, backgroundColor: '#FFCE00' }} />
        </View>
      );
    case 'it':
      return (
        <View style={{ flex: 1, flexDirection: 'row' }}>
          <View style={{ flex: 1, backgroundColor: '#009246' }} />
          <View style={{ flex: 1, backgroundColor: '#FFFFFF' }} />
          <View style={{ flex: 1, backgroundColor: '#CE2B37' }} />
        </View>
      );
    case 'es':
      return (
        <View style={{ flex: 1, flexDirection: 'column' }}>
          <View style={{ flex: 1, backgroundColor: '#AA151B' }} />
          <View style={{ flex: 2, backgroundColor: '#F1BF00' }} />
          <View style={{ flex: 1, backgroundColor: '#AA151B' }} />
        </View>
      );
    case 'hu':
      return (
        <View style={{ flex: 1, flexDirection: 'column' }}>
          <View style={{ flex: 1, backgroundColor: '#CE2939' }} />
          <View style={{ flex: 1, backgroundColor: '#FFFFFF' }} />
          <View style={{ flex: 1, backgroundColor: '#477050' }} />
        </View>
      );
    case 'sv':
      return (
        <View style={{ flex: 1, backgroundColor: '#006AA7' }}>
          <View style={{ position: 'absolute', top: size * 0.375, left: 0, right: 0, height: size * 0.25, backgroundColor: '#FECC02' }} />
          <View style={{ position: 'absolute', top: 0, bottom: 0, left: size * 0.3, width: size * 0.25, backgroundColor: '#FECC02' }} />
        </View>
      );
    case 'tr':
      return (
        <View style={{ flex: 1, backgroundColor: '#E30A17' }}>
          <View style={{ position: 'absolute', width: size * 0.45, height: size * 0.45, borderRadius: size * 0.225, backgroundColor: '#FFFFFF', top: size * 0.275, left: size * 0.12 }} />
          <View style={{ position: 'absolute', width: size * 0.4, height: size * 0.4, borderRadius: size * 0.2, backgroundColor: '#E30A17', top: size * 0.3, left: size * 0.22 }} />
        </View>
      );
    case 'ar':
      // UAE — red left stripe, then green/white/black horizontal bands
      return (
        <View style={{ flex: 1, flexDirection: 'row' }}>
          <View style={{ width: size * 0.25, backgroundColor: '#EF3340' }} />
          <View style={{ flex: 1, flexDirection: 'column' }}>
            <View style={{ flex: 1, backgroundColor: '#009A44' }} />
            <View style={{ flex: 1, backgroundColor: '#FFFFFF' }} />
            <View style={{ flex: 1, backgroundColor: '#231F20' }} />
          </View>
        </View>
      );
    case 'en':
    default:
      return (
        <View style={{ flex: 1, backgroundColor: '#012169' }}>
          <View style={{ position: 'absolute', top: size * 0.375, left: 0, right: 0, height: size * 0.25, backgroundColor: '#FFFFFF' }} />
          <View style={{ position: 'absolute', top: 0, bottom: 0, left: size * 0.375, width: size * 0.25, backgroundColor: '#FFFFFF' }} />
          <View style={{ position: 'absolute', top: size * 0.425, left: 0, right: 0, height: size * 0.15, backgroundColor: '#C8102E' }} />
          <View style={{ position: 'absolute', top: 0, bottom: 0, left: size * 0.425, width: size * 0.15, backgroundColor: '#C8102E' }} />
        </View>
      );
  }
}

export function FlagCircle({ code, size = 28, muted = false }: { code: string; size?: number; muted?: boolean }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, overflow: 'hidden' }}>
      <FlagInterior code={code} size={size} />
      {muted && <View style={[StyleSheet.absoluteFillObject, styles.mutedOverlay]} />}
    </View>
  );
}

export function GlobeCircle({ size = 20, muted = false }: { size?: number; muted?: boolean }) {
  const s = size;
  const land = '#77BF4A';
  return (
    <View style={{ width: s, height: s, borderRadius: s / 2, overflow: 'hidden', backgroundColor: '#3BAEE8' }}>
      {/* North America */}
      <View style={{ position: 'absolute', left: s*0.03, top: s*0.03, width: s*0.30, height: s*0.36, backgroundColor: land, borderRadius: s*0.12 }} />
      {/* Greenland */}
      <View style={{ position: 'absolute', left: s*0.24, top: -s*0.02, width: s*0.13, height: s*0.16, backgroundColor: land, borderRadius: s*0.07 }} />
      {/* Central America connector */}
      <View style={{ position: 'absolute', left: s*0.14, top: s*0.37, width: s*0.09, height: s*0.10, backgroundColor: land, borderRadius: s*0.04 }} />
      {/* South America */}
      <View style={{ position: 'absolute', left: s*0.10, top: s*0.45, width: s*0.26, height: s*0.46, backgroundColor: land, borderRadius: s*0.13 }} />
      {/* Europe */}
      <View style={{ position: 'absolute', left: s*0.50, top: s*0.02, width: s*0.20, height: s*0.25, backgroundColor: land, borderRadius: s*0.08 }} />
      {/* Africa */}
      <View style={{ position: 'absolute', left: s*0.46, top: s*0.27, width: s*0.25, height: s*0.54, backgroundColor: land, borderRadius: s*0.12 }} />
      {/* Asia (right edge, partially clipped by circle) */}
      <View style={{ position: 'absolute', left: s*0.64, top: -s*0.02, width: s*0.40, height: s*0.42, backgroundColor: land, borderRadius: s*0.10 }} />
      {muted && <View style={[StyleSheet.absoluteFillObject, styles.mutedOverlay]} />}
    </View>
  );
}

const styles = StyleSheet.create({
  mutedOverlay: {
    backgroundColor: 'rgba(255,255,255,0.38)',
  },
});
