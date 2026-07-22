import { useRef, useCallback } from 'react';
import { NativeSyntheticEvent, NativeScrollEvent } from 'react-native';
import { useTabBar } from '../contexts/TabBarContext';

export function useScrollTabBar() {
  const { setTabBarHidden } = useTabBar();
  const lastY = useRef(0);

  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = e.nativeEvent.contentOffset.y;
    if (y > 120 && y > lastY.current + 10) setTabBarHidden(true);
    else if (y < lastY.current - 10 || y < 80) setTabBarHidden(false);
    lastY.current = y;
  }, [setTabBarHidden]);

  return onScroll;
}
