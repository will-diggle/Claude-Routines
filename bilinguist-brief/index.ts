import { registerRootComponent } from 'expo';
import App from './App';

// Override Hermes promise-rejection hook AFTER expo's InitializeCore has run.
// In Hermes + old arch, unhandled rejections go through HermesInternal directly
// — not through ErrorUtils — so we must replace this hook to stop abort().
const hi = (global as any).HermesInternal;
if (hi?.setPromiseRejectionTrackingHook) {
  hi.setPromiseRejectionTrackingHook((_id: number, error: unknown) => {
    const msg = (error instanceof Error) ? error.message : String(error);
    console.warn('[unhandled promise rejection]', msg);
  });
}

// Fallback: intercept synchronous fatal errors via the global ErrorUtils.
// Access as a global — importing from 'react-native' can return undefined
// in some build environments before InitializeCore finishes.
const EU = (global as any).ErrorUtils;
if (EU?.getGlobalHandler) {
  const prev = EU.getGlobalHandler();
  EU.setGlobalHandler((error: Error, isFatal: boolean) => {
    if (isFatal) {
      console.warn('[fatal error intercepted]', error?.message ?? String(error));
      return;
    }
    prev?.(error, isFatal);
  });
}

registerRootComponent(App);
