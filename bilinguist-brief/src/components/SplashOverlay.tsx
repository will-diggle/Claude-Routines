import React, { useEffect, useRef, useState } from 'react';
import { View, Image, Text, StyleSheet, Animated, Dimensions } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const LOGOTYPE = require('../../assets/logotype.png');
const SCREEN_WIDTH = Dimensions.get('window').width;
const LAUNCHED_KEY = 'bilinguist_has_launched';
const SHOW_DURATION = 2000; // ms before fade begins
const FADE_DURATION = 500;

interface Props {
  onDone: () => void;
}

export function SplashOverlay({ onDone }: Props) {
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const timer = setTimeout(() => {
      Animated.timing(opacity, {
        toValue: 0,
        duration: FADE_DURATION,
        useNativeDriver: true,
      }).start(() => onDone());
    }, SHOW_DURATION);
    return () => clearTimeout(timer);
  }, []);

  return (
    <Animated.View style={[styles.overlay, { opacity }]}>
      <View style={[styles.rule, styles.ruleOuter]} />
      <View style={[styles.rule, styles.ruleInner]} />
      <View style={styles.body}>
        <Image source={LOGOTYPE} style={styles.logotype} resizeMode="contain" />
        <View style={[styles.rule, styles.ruleInner, { marginTop: 20 }]} />
        <View style={[styles.rule, styles.ruleOuter]} />
        <Text style={styles.tagline}>Your daily bilingual brief</Text>
      </View>
      <View style={[styles.rule, styles.ruleInner]} />
      <View style={[styles.rule, styles.ruleOuter]} />
    </Animated.View>
  );
}

export async function shouldShowSplash(): Promise<boolean> {
  try {
    const val = await AsyncStorage.getItem(LAUNCHED_KEY);
    if (!val) {
      await AsyncStorage.setItem(LAUNCHED_KEY, '1');
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#F5F0E8',
    zIndex: 999,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  rule: {
    width: SCREEN_WIDTH,
  },
  ruleOuter: {
    height: 2,
    backgroundColor: '#1A1A1A',
  },
  ruleInner: {
    height: 1,
    backgroundColor: '#B0A898',
    marginVertical: 2,
  },
  body: {
    alignItems: 'center',
    paddingVertical: 32,
    width: '100%',
  },
  logotype: {
    width: SCREEN_WIDTH - 64,
    height: 64,
  },
  tagline: {
    marginTop: 16,
    fontSize: 12,
    letterSpacing: 2,
    color: '#6B5E4E',
    fontStyle: 'italic',
    textTransform: 'uppercase',
  },
});
