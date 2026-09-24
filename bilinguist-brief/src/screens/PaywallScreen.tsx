import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  Image,
  Modal,
  Animated,
  Pressable,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  StyleSheet,
  Dimensions,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../hooks/useTheme';
import { useSubscriptionStore } from '../store/useSubscriptionStore';
import { GlassSurface } from '../components/GlassSurface';
import { Spacing } from '../theme';
import * as analytics from '../services/analytics';
import { isEligibleForIntroOffer } from '../services/purchases';

const FREE_FEATURES = [
  'English + 1 language of your choice',
  'Your chosen CEFR level',
  'Weather + 2 Global News stories/day',
  'Concise-length articles',
  'Flashcards — 4 rounds a day',
];

const PAID_FEATURES = [
  'All languages, switch any time',
  'Full-length articles, every genre',
  'Every Global News story, daily',
  'All 5 practice games, unlimited',
  'Word bank + full word explanations',
];

// Same compact masthead crop used at the top of the Briefing screen, so the
// paywall reads as the same masthead, not a different logo bolted on.
const MASTHEADS: Record<string, ReturnType<typeof require>> = {
  cream:    require('../../assets/masthead-compact-cream.png'),
  softGrey: require('../../assets/masthead-compact-navy.png'),
  white:    require('../../assets/masthead-compact-white.png'),
  night:    require('../../assets/masthead-compact-black.png'),
};

function chromeColor(bg: string) {
  if (bg === 'cream')    return '#162032';
  if (bg === 'softGrey') return '#F5F0E8';
  if (bg === 'white')    return '#1A1A1A';
  return '#F5F0E8'; // night
}

function hairlineColor(bg: string) {
  if (bg === 'cream')    return 'rgba(22,32,50,0.32)';
  if (bg === 'softGrey') return 'rgba(245,240,232,0.40)';
  if (bg === 'white')    return 'rgba(26,26,26,0.30)';
  return 'rgba(245,240,232,0.40)';
}

const { width: SW, height: SH } = Dimensions.get('window');
const CARD_RADIUS = 20;
const CARD_W = SW - 40;
const LOCKUP_W = Math.round(CARD_W * 0.72);
const LOCKUP_H = Math.round(LOCKUP_W / 5.06); // masthead-compact-*.png is 3271×646

interface Props {
  visible: boolean;
  onClose?: () => void;
}

export function PaywallScreen({ visible, onClose }: Props) {
  const { colors, fontFamily, fontSize, background, isDark } = useTheme();
  const { applyPromoCode, purchase, restore, loadPackages, packages, packagesLoading, purchaseInProgress } = useSubscriptionStore();
  const chrome = chromeColor(background);
  const hairline = hairlineColor(background);

  const [promoVisible, setPromoVisible] = useState(false);
  const [promoInput, setPromoInput] = useState('');

  // Same scale-in/out treatment as the weather widget's popup — this only
  // fires when `visible` actually flips, since Modal keeps this component
  // mounted between opens rather than remounting it.
  const scaleAnim = useRef(new Animated.Value(0.88)).current;
  useEffect(() => {
    if (visible) {
      analytics.trackPaywallShown();
      loadPackages();
      scaleAnim.setValue(0.88);
      Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, tension: 200, friction: 16 }).start();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const monthlyPackage = packages.find((p) => p.packageType === 'MONTHLY') ?? packages[0];
  // StoreKit/RevenueCat returns priceString localized to the user's own App
  // Store storefront whenever the real product has loaded — this fallback
  // only shows if that never resolves, so it must track the actual
  // configured price (£3.99/month), not a stale placeholder.
  const priceValue = monthlyPackage?.product.priceString ?? '£3.99';
  // While the real price is still in flight, show a neutral loading state
  // rather than risk displaying (or screenshotting) the fallback as if it
  // were live.
  const priceLoading = packagesLoading && !monthlyPackage;

  // A free trial is a $0 introductory offer — check the user hasn't already
  // used it (per their App Store account) before showing trial copy.
  const introPrice = monthlyPackage?.product.introPrice ?? null;
  const [trialEligible, setTrialEligible] = useState(false);
  useEffect(() => {
    if (!visible || !monthlyPackage || !introPrice || introPrice.price > 0) { setTrialEligible(false); return; }
    let cancelled = false;
    isEligibleForIntroOffer(monthlyPackage.product.identifier).then((eligible) => {
      if (!cancelled) setTrialEligible(eligible);
    });
    return () => { cancelled = true; };
  }, [visible, monthlyPackage, introPrice]);

  const showTrialCopy = trialEligible && !!introPrice;
  const trialLengthText = introPrice
    ? `${introPrice.periodNumberOfUnits} ${introPrice.periodUnit.toLowerCase()}${introPrice.periodNumberOfUnits === 1 ? '' : 's'}`
    : '';

  function handlePromoSubmit() {
    const result = applyPromoCode(promoInput);
    if (result === 'success') {
      Alert.alert('Access unlocked', 'You now have full access to Bilinguist Brief.');
      onClose?.();
    } else if (result === 'already_active') {
      Alert.alert('Already active', 'You already have full access.');
      onClose?.();
    } else {
      Alert.alert('Invalid code', 'That code wasn\'t recognised. Please check and try again.');
    }
  }

  async function handleSubscribe() {
    if (!monthlyPackage) {
      Alert.alert(
        'Subscription unavailable',
        'Add your RevenueCat API key and configure an offering to enable in-app purchases.\n\nFor testing, use your promo code instead.',
        [{ text: 'OK' }]
      );
      return;
    }
    const result = await purchase(monthlyPackage);
    if (result === 'success') {
      analytics.trackSubscriptionStarted(monthlyPackage.identifier);
      Alert.alert('Subscribed', 'You now have full access to Bilinguist Brief.');
      onClose?.();
    } else if (result === 'error') {
      Alert.alert('Purchase failed', 'Something went wrong completing the purchase. Please try again.');
    }
    // 'cancelled' — user backed out of the native purchase sheet, no alert needed.
  }

  async function handleRestore() {
    const result = await restore();
    if (result === 'success') {
      Alert.alert('Restored', 'Your purchase has been restored.');
      onClose?.();
    } else if (result === 'no_purchases') {
      Alert.alert('Nothing to restore', "We couldn't find a previous purchase for this account.");
    } else {
      Alert.alert('Restore failed', 'Something went wrong. Please try again.');
    }
  }

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      {/* Solid scrim behind the blur — iOS renders BlurView fully transparent
          (not just less-blurred) under Low Power Mode or the Reduce
          Transparency accessibility setting, both more common on older
          devices, which otherwise leaves the backdrop looking unstyled. */}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: isDark ? 'rgba(20,18,16,0.55)' : 'rgba(245,240,232,0.6)' }]} pointerEvents="none" />
      <BlurView intensity={10} tint={isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} pointerEvents="none" />
      {/* Dismiss on tap OUTSIDE the card — sits behind the card in z-order */}
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />

      <View style={styles.backdrop} pointerEvents="box-none">
        {/* Shadow lives on this outer wrapper — separated from the
            overflow:hidden content below, since the two on the same view
            clip the shadow itself on iOS (same fix as the comparison box). */}
        <Animated.View style={[styles.modalShadow, { width: CARD_W, transform: [{ scale: scaleAnim }] }]}>
        <View
          style={[
            styles.modalInner,
            {
              // The true theme background, not colors.card (a distinct,
              // slightly different "elevated surface" shade meant for
              // smaller nested elements) — this card fills nearly the
              // whole screen, so it should read as the actual theme
              // background, not an off-tone surface colour.
              backgroundColor: colors.bg,
              borderColor: colors.borderLight,
            },
          ]}
          onStartShouldSetResponder={() => true}
        >
          {onClose && (
            // Built directly on BlurView rather than the shared GlassButton —
            // that component didn't reliably respond to taps here on a real
            // device, same class of issue as LegalDocModal's back button
            // (see that file's comment); BlurView is proven reliable in both.
            <TouchableOpacity
              onPress={onClose}
              style={styles.closeButton}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <View style={[styles.closeButtonBg, { backgroundColor: isDark ? 'rgba(40,40,40,0.80)' : 'rgba(255,255,255,0.80)' }]}>
                <BlurView intensity={isDark ? 60 : 70} tint={isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
              </View>
              <Ionicons name="close" size={17} color={colors.inkDark} style={styles.closeButtonIcon} />
            </TouchableOpacity>
          )}

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.cardContent}
            bounces={false}
          >
            {/* Masthead */}
            <View style={styles.lockupWrap}>
              <Image
                key={background}
                source={MASTHEADS[background] ?? MASTHEADS.cream}
                style={styles.lockup}
                resizeMode="contain"
              />
            </View>

            <Text style={[styles.cities, { color: chrome, fontFamily: fontFamily.regular }]}>
              PREMIUM EDITION
            </Text>

            {/* Thin rule */}
            <View style={[styles.ruleInset, { backgroundColor: hairline }]} />

            {/* Meta row: price (left) · cancel-anytime tagline (right) */}
            <View style={styles.metaRow}>
              <Text style={[styles.metaDate, { color: colors.inkMid, fontFamily: fontFamily.regular }]}>
                {priceLoading
                  ? 'Loading price…'
                  : showTrialCopy
                  ? `${trialLengthText} free, then ${priceValue} / month`
                  : `${priceValue} / month`}
              </Text>
              <Text style={[styles.tagline, { color: colors.inkMid, fontFamily: fontFamily.italic }]}>
                Cancel anytime
              </Text>
            </View>

            {/* Headline */}
            <View style={styles.titleWrap}>
              <Text style={[styles.docTitle, { color: colors.inkDark, fontFamily: fontFamily.bold, fontSize: fontSize.heading }]}>
                Unlock the full edition
              </Text>
              <Text style={[styles.subhead, { color: colors.inkMid, fontFamily: fontFamily.italic, fontSize: fontSize.body }]}>
                Read the news in any language, at any level. Learn without thinking about it.
              </Text>
            </View>

            <View style={styles.bodyWrap}>
              {/* Feature comparison — shadow lives on this outer wrapper, separate
                  from the rounded-corner clipping below, since overflow:hidden on
                  the same view as a shadow clips the shadow itself on iOS. */}
              <View style={[styles.comparisonShadow, { shadowColor: '#000' }]}>
                <View style={[styles.comparisonBox, { borderColor: colors.borderLight, backgroundColor: colors.card }]}>
                  <View style={[styles.comparisonHeader, { borderBottomColor: colors.borderLight }]}>
                    <Text style={[styles.comparisonTitle, { color: colors.inkMid, fontFamily: fontFamily.regular }]}>FREE</Text>
                    <Text style={[styles.comparisonTitle, { color: colors.inkDark, fontFamily: fontFamily.bold }]}>PREMIUM</Text>
                  </View>

                  <View style={styles.comparisonBody}>
                    <View style={styles.comparisonCol}>
                      {FREE_FEATURES.map((f) => (
                        <View key={f} style={styles.featureRow}>
                          <Ionicons name="checkmark" size={15} color={colors.inkLight} />
                          <Text style={[styles.featureText, { color: colors.inkLight, fontFamily: fontFamily.regular }]}>{f}</Text>
                        </View>
                      ))}
                    </View>
                    <View style={[styles.dividerV, { backgroundColor: colors.borderLight }]} />
                    <View style={styles.comparisonCol}>
                      {PAID_FEATURES.map((f) => (
                        <View key={f} style={styles.featureRow}>
                          <Ionicons name="checkmark" size={15} color={colors.inkDark} />
                          <Text style={[styles.featureText, { color: colors.inkDark, fontFamily: fontFamily.regular }]}>{f}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                </View>
              </View>

              {/* Subscribe — liquid-glass pill, always black regardless of app
                  theme (a deliberate primary-CTA color, not theme-following like
                  the Sign-in modal's buttons). */}
              <View style={[styles.glassPillShadow, { opacity: purchaseInProgress ? 0.6 : 1 }]}>
                <TouchableOpacity
                  style={[styles.glassPillButton, { backgroundColor: 'rgba(0,0,0,0.94)' }]}
                  onPress={handleSubscribe}
                  disabled={purchaseInProgress}
                >
                  <GlassSurface cornerRadius={100} colorScheme="dark" intensity={80} />
                  <Text style={[styles.glassPillText, { color: '#FFF', fontFamily: fontFamily.bold }]}>
                    {purchaseInProgress
                      ? 'Processing…'
                      : priceLoading
                      ? 'Subscribe'
                      : showTrialCopy
                      ? `Start ${trialLengthText} free trial`
                      : `Subscribe — ${priceValue}/month`}
                  </Text>
                </TouchableOpacity>
              </View>

              <View style={styles.bottomRow}>
                <TouchableOpacity onPress={handleRestore}>
                  <Text style={[styles.restoreText, { color: colors.inkFaint, fontFamily: fontFamily.regular }]}>
                    Restore purchase
                  </Text>
                </TouchableOpacity>

                {!promoVisible ? (
                  <TouchableOpacity onPress={() => setPromoVisible(true)}>
                    <Text style={[styles.promoToggle, { color: colors.inkFaint, fontFamily: fontFamily.regular }]}>
                      Have a code?
                    </Text>
                  </TouchableOpacity>
                ) : null}
              </View>

              {promoVisible && (
                <View style={styles.promoRow}>
                  <TextInput
                    style={[styles.promoInput, { color: colors.inkDark, borderColor: colors.borderMid, fontFamily: fontFamily.regular, backgroundColor: colors.bg }]}
                    value={promoInput}
                    onChangeText={setPromoInput}
                    placeholder="Enter code"
                    placeholderTextColor={colors.inkFaint}
                    autoCapitalize="characters"
                    autoFocus
                    onSubmitEditing={handlePromoSubmit}
                  />
                  <TouchableOpacity
                    style={[styles.promoButton, { backgroundColor: 'rgba(0,0,0,0.94)' }]}
                    onPress={handlePromoSubmit}
                  >
                    <Text style={[styles.promoButtonText, { fontFamily: fontFamily.regular }]}>Apply</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </ScrollView>
        </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  modalShadow: {
    borderRadius: CARD_RADIUS,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.35,
    shadowRadius: 24,
    elevation: 14,
  },
  modalInner: {
    maxHeight: SH * 0.86,
    borderRadius: CARD_RADIUS,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  closeButton: {
    position: 'absolute',
    top: 10,
    left: 10,
    zIndex: 20,
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 6,
  },
  closeButtonBg: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 16,
    overflow: 'hidden',
  },
  closeButtonIcon: {
    zIndex: 1,
  },
  cardContent: {
    paddingBottom: 28,
  },

  lockupWrap: {
    width: CARD_W,
    alignItems: 'center',
    paddingTop: 26,
    paddingBottom: 8,
  },
  lockup: {
    width: LOCKUP_W,
    height: LOCKUP_H,
  },

  cities: {
    width: CARD_W,
    textAlign: 'center',
    fontSize: 9,
    letterSpacing: 2.5,
    textTransform: 'uppercase',
    paddingTop: 4,
    paddingBottom: 10,
  },

  ruleInset: {
    height: 1,
    marginHorizontal: 16,
    marginVertical: 10,
    borderRadius: 1,
  },

  metaRow: {
    width: CARD_W,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 10,
  },
  metaDate: {
    flex: 1,
    fontSize: 10,
    opacity: 0.6,
    lineHeight: 14,
  },
  tagline: {
    fontSize: 13,
    fontStyle: 'italic',
    paddingRight: 4,
  },

  titleWrap: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 16,
  },
  docTitle: { textAlign: 'center', lineHeight: 30 },
  subhead: { textAlign: 'center', lineHeight: 19, marginTop: 4, fontSize: 13 },

  bodyWrap: {
    paddingHorizontal: 20,
    gap: Spacing.lg,
  },

  comparisonShadow: {
    borderRadius: 12,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.16,
    shadowRadius: 8,
    elevation: 4,
  },
  comparisonBox: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    overflow: 'hidden',
  },
  comparisonHeader: {
    flexDirection: 'row',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  comparisonTitle: {
    flex: 1,
    textAlign: 'center',
    paddingVertical: Spacing.md,
    fontSize: 12,
    letterSpacing: 1,
  },
  comparisonBody: { flexDirection: 'row' },
  comparisonCol: { flex: 1, padding: Spacing.md, gap: 12 },
  dividerV: { width: StyleSheet.hairlineWidth },
  featureRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  featureText: { flex: 1, fontSize: 13, lineHeight: 17 },

  glassPillShadow: {
    borderRadius: 100,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 6,
  },
  glassPillButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 17,
    borderRadius: 100,
    overflow: 'hidden',
  },
  glassPillText: { fontSize: 15 },

  bottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  restoreText: { fontSize: 12 },
  promoToggle: { fontSize: 12 },
  promoRow: { flexDirection: 'row', gap: Spacing.sm, width: '100%' },
  promoInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 100,
    paddingHorizontal: Spacing.lg,
    paddingVertical: 11,
    fontSize: 14,
    letterSpacing: 2,
  },
  promoButton: {
    borderRadius: 100,
    paddingHorizontal: Spacing.lg,
    paddingVertical: 11,
    justifyContent: 'center',
  },
  promoButtonText: { color: '#FFF', fontSize: 14 },
});
