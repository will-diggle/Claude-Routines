import { createContext, useContext } from 'react';
import { Animated } from 'react-native';

interface TabBarContextValue {
  setTabBarHidden: (hidden: boolean) => void;
  tabBarAnim: Animated.Value;   // 1 = visible, 0 = hidden
  miniAnim: Animated.Value;     // 1 = visible (mini pill), 0 = hidden
}

const fallbackAnim = new Animated.Value(1);
const fallbackMini = new Animated.Value(0);

export const TabBarContext = createContext<TabBarContextValue>({
  setTabBarHidden: () => {},
  tabBarAnim: fallbackAnim,
  miniAnim: fallbackMini,
});

export const useTabBar = () => useContext(TabBarContext);
