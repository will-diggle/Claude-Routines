import { Platform } from 'react-native';
import Purchases, { LOG_LEVEL, type CustomerInfo, type PurchasesPackage } from 'react-native-purchases';

// Must match the entitlement identifier in the RevenueCat dashboard
// (Product catalog → Entitlements) that the App Store subscription
// product is attached to.
export const PRO_ENTITLEMENT_ID = 'bilinguist_brief_pro';

let _configured = false;

export function initPurchases(): void {
  const apiKey = Platform.select({
    ios: process.env.EXPO_PUBLIC_REVENUECAT_API_KEY_IOS,
    android: process.env.EXPO_PUBLIC_REVENUECAT_API_KEY_ANDROID,
  });
  if (!apiKey) {
    console.warn('[purchases] No RevenueCat API key set for this platform — purchases disabled.');
    return;
  }
  try {
    Purchases.setLogLevel(__DEV__ ? LOG_LEVEL.DEBUG : LOG_LEVEL.ERROR);
    Purchases.configure({ apiKey });
    _configured = true;
  } catch (e) {
    console.warn('[purchases] RevenueCat configure failed:', e);
  }
}

export function isPurchasesConfigured(): boolean {
  return _configured;
}

/** Link RevenueCat's app-user-id to the signed-in Supabase user, so
 *  entitlement follows the account across devices/reinstalls rather than
 *  being tied to one anonymous device id. Call on sign-in. */
export async function loginPurchasesUser(userId: string): Promise<CustomerInfo | null> {
  if (!_configured) return null;
  try {
    const { customerInfo } = await Purchases.logIn(userId);
    return customerInfo;
  } catch (e) {
    console.warn('[purchases] logIn failed:', e);
    return null;
  }
}

/** Call on sign-out — reverts RevenueCat to a new anonymous app-user-id. */
export async function logoutPurchasesUser(): Promise<void> {
  if (!_configured) return;
  try {
    await Purchases.logOut();
  } catch (e) {
    console.warn('[purchases] logOut failed:', e);
  }
}

export function hasProEntitlement(info: CustomerInfo | null | undefined): boolean {
  return !!info?.entitlements.active[PRO_ENTITLEMENT_ID];
}

export async function fetchCustomerInfo(): Promise<CustomerInfo | null> {
  if (!_configured) return null;
  try {
    return await Purchases.getCustomerInfo();
  } catch (e) {
    console.warn('[purchases] getCustomerInfo failed:', e);
    return null;
  }
}

/** Current offering's packages (e.g. monthly/annual) as configured in the
 *  RevenueCat dashboard — Offerings tab. */
export async function fetchPackages(): Promise<PurchasesPackage[]> {
  if (!_configured) return [];
  try {
    const offerings = await Purchases.getOfferings();
    return offerings.current?.availablePackages ?? [];
  } catch (e) {
    console.warn('[purchases] getOfferings failed:', e);
    return [];
  }
}

export async function purchasePackage(pkg: PurchasesPackage): Promise<{ ok: true; info: CustomerInfo } | { ok: false; userCancelled: boolean; error?: unknown }> {
  try {
    const { customerInfo } = await Purchases.purchasePackage(pkg);
    return { ok: true, info: customerInfo };
  } catch (e: any) {
    return { ok: false, userCancelled: !!e?.userCancelled, error: e };
  }
}

export async function restorePurchases(): Promise<CustomerInfo | null> {
  if (!_configured) return null;
  try {
    return await Purchases.restorePurchases();
  } catch (e) {
    console.warn('[purchases] restorePurchases failed:', e);
    return null;
  }
}

/** Fires whenever RevenueCat's view of the customer's entitlements changes
 *  (purchase, renewal, cancellation, refund, cross-device restore) — wire
 *  this to useSubscriptionStore so status stays live without polling. */
export function addCustomerInfoListener(cb: (info: CustomerInfo) => void): () => void {
  if (!_configured) return () => {};
  Purchases.addCustomerInfoUpdateListener(cb);
  return () => Purchases.removeCustomerInfoUpdateListener(cb);
}
