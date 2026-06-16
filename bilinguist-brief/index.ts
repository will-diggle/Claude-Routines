import { registerRootComponent } from 'expo';
import { ErrorUtils } from 'react-native';
import App from './App';

// Global safety net: downgrade any fatal unhandled promise rejection to a
// warning so a single failed network call can never crash the app.
// Individual call sites still have their own try-catch; this is the last line
// of defence for any we've missed.
const nativeHandler = ErrorUtils.getGlobalHandler();
ErrorUtils.setGlobalHandler((error, isFatal) => {
  if (isFatal) {
    console.warn('[unhandled]', error?.message ?? String(error));
    return; // swallow — do not call nativeHandler which calls abort()
  }
  nativeHandler?.(error, isFatal);
});

registerRootComponent(App);
