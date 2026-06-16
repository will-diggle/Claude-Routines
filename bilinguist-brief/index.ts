import { registerRootComponent } from 'expo';
import { ErrorUtils } from 'react-native';
import App from './App';

// By the time this module body runs, InitializeCore.js has already executed
// (triggered by the 'expo' import above) and installed React Native's own
// Hermes promise-rejection hook — the one that calls abort() on unhandled
// rejections. We replace it here so rejections are downgraded to warnings.
//
// ErrorUtils.setGlobalHandler alone is NOT enough: in Hermes + old arch,
// unhandled promise rejections bypass ErrorUtils and go through
// HermesInternal.setPromiseRejectionTrackingHook directly to native.
// We must override both.

// 1. Override the Hermes-level rejection hook (primary crash path in old arch)
const hi = (global as any).HermesInternal;
if (hi?.setPromiseRejectionTrackingHook) {
  hi.setPromiseRejectionTrackingHook((_id: number, error: unknown) => {
    const msg = (error instanceof Error) ? error.message : String(error);
    console.warn('[unhandled promise rejection]', msg);
    // Do NOT call the previous hook — that's what calls abort()
  });
}

// 2. Also override ErrorUtils as a fallback for synchronous fatal errors
const nativeHandler = ErrorUtils.getGlobalHandler();
ErrorUtils.setGlobalHandler((error, isFatal) => {
  if (isFatal) {
    console.warn('[fatal error intercepted]', error?.message ?? String(error));
    return;
  }
  nativeHandler?.(error, isFatal);
});

registerRootComponent(App);
