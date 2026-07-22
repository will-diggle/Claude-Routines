import { EventEmitter, requireNativeModule } from 'expo';

// Gracefully degrade when running in Expo Go or when the pod isn't linked yet.
let NativeTabNativeModule: Record<string, unknown> | null = null;
let emitter: EventEmitter | null = null;

try {
  NativeTabNativeModule = requireNativeModule('NativeTab') as Record<string, unknown>;
  emitter = new EventEmitter(NativeTabNativeModule as any);
} catch {
  // module not linked — no-op
}

export const isNativeTabAvailable = Boolean(NativeTabNativeModule);

/**
 * Subscribe to native tab-bar taps.
 * `index` matches the Tab.Screen order: 0=Briefing, 1=Practice, 2=Preferences.
 * Returns an unsubscribe function.
 */
export function addTabChangeListener(callback: (index: number) => void): () => void {
  if (!emitter) return () => {};
  const sub = emitter.addListener('onTabChange', (event: { index: number }) => {
    callback(event.index);
  });
  return () => sub.remove();
}

/**
 * Tell the native tab bar which tab is currently selected.
 * Call this when RN navigates programmatically (notifications, deep links).
 */
export function setNativeSelectedTab(index: number): void {
  if (!NativeTabNativeModule) return;
  (NativeTabNativeModule.setSelectedTab as (i: number) => void)?.(index);
}
