import { requireNativeView } from 'expo';
import { ViewProps } from 'react-native';

export interface LiquidGlassViewProps extends ViewProps {
  cornerRadius?: number;
  intensity?: number;
}

export const LiquidGlassView: React.ComponentType<LiquidGlassViewProps> =
  requireNativeView('LiquidGlass');
