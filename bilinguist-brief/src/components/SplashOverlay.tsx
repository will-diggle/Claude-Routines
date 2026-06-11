import React, { useEffect } from 'react';
import { View, Image, StyleSheet, Dimensions } from 'react-native';
import { useTheme } from '../hooks/useTheme';
import type { BackgroundKey } from '../theme';

const MASTHEADS: Record<BackgroundKey, ReturnType<typeof require>> = {
  cream:    require('../../assets/masthead-cream.png'),
  softGrey: require('../../assets/masthead-navy.png'),
  white:    require('../../assets/masthead-white.png'),
  night:    require('../../assets/masthead-black.png'),
};

const SW = Dimensions.get('window').width;
const LOGO_W = SW * 0.72;
const LOGO_H = Math.round(LOGO_W / 5.17);

interface Props {
  onDone: () => void;
}

export function SplashOverlay({ onDone }: Props) {
  const { colors, background } = useTheme();

  useEffect(() => {
    const t = setTimeout(onDone, 1400);
    return () => clearTimeout(t);
  }, [onDone]);

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <Image
        source={MASTHEADS[background as BackgroundKey] ?? MASTHEADS.cream}
        style={{ width: LOGO_W, height: LOGO_H }}
        resizeMode="contain"
      />
    </View>
  );
}

export async function shouldShowSplash(): Promise<boolean> {
  return true;
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
