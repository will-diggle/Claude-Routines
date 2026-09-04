import { Animated } from 'react-native';

// Shared scroll-Y value driven by the active briefing page's vertical ScrollView.
// Drives the header's own scroll-linked animations and, via
// useNavPillStore's briefingScrolled flag, the nav pills' open/closed state.
export const briefingScrollY = new Animated.Value(0);
