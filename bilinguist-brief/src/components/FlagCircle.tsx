import React from 'react';
import { View } from 'react-native';

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

export function FlagCircle({ code, size = 28 }: { code: string; size?: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, overflow: 'hidden' }}>
      <FlagInterior code={code} size={size} />
    </View>
  );
}
