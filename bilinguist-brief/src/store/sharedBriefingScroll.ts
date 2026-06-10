import { Animated } from 'react-native';

// Shared scroll-Y value driven by the active briefing page's vertical ScrollView.
// FloatingAudioPill reads this to dock when the user scrolls down.
export const briefingScrollY = new Animated.Value(0);
