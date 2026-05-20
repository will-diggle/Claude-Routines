import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../hooks/useTheme';
import { useSubscriptionStore } from '../store/useSubscriptionStore';
import { Spacing } from '../theme';

const FREE_FEATURES = [
  '1 World News article daily',
  '5 teaser headlines',
  'English only',
];

const PAID_FEATURES = [
  'Full daily briefing (5–15 min read)',
  'French, German, Spanish, Italian',
  'Your chosen CEFR level',
  'Tap any word for instant translation',
  'Claude word explanations + IPA',
  'Word bank with spaced repetition',
  'Flashcards, games & streak tracking',
  'Weather strip in your language',
];

interface Props {
  onClose?: () => void;
}

export function PaywallScreen({ onClose }: Props) {
  const { colors, fontFamily, fontSize } = useTheme();
  const insets = useSafeAreaInsets();
  const { applyPromoCode, activateRevenueCat, restore, isFullAccess } = useSubscriptionStore();

  const [promoVisible, setPromoVisible] = useState(false);
  const [promoInput, setPromoInput] = useState('');

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

  function handleSubscribe() {
    // RevenueCat purchase flow — stub
    // Production: await Purchases.purchasePackage(package)
    Alert.alert(
      'Subscription',
      'Add your RevenueCat API key to enable in-app purchases.\n\nFor testing, use your promo code instead.',
      [{ text: 'OK' }]
    );
  }

  function handleRestore() {
    Alert.alert('Restore', 'Add your RevenueCat API key to enable purchase restoration.');
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.bg, paddingBottom: insets.bottom }]}>
      {/* Close button */}
      {onClose && (
        <TouchableOpacity
          style={[styles.closeButton, { top: insets.top + 12 }]}
          onPress={onClose}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Ionicons name="close" size={22} color={colors.inkLight} />
        </TouchableOpacity>
      )}

      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + 48 }]} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <Text style={[styles.masthead, { color: colors.inkDark, fontFamily: fontFamily.bold }]}>
          Bilinguist Brief
        </Text>
        <View style={[styles.rule, { backgroundColor: colors.inkDark }]} />
        <Text style={[styles.headline, { color: colors.inkDark, fontFamily: fontFamily.bold, fontSize: fontSize.heading }]}>
          Unlock the full edition
        </Text>
        <Text style={[styles.subhead, { color: colors.inkMid, fontFamily: fontFamily.italic, fontSize: fontSize.body }]}>
          Read the news in any language. Learn without thinking about it.
        </Text>

        {/* Pricing */}
        <View style={[styles.priceCard, { backgroundColor: colors.accentGold }]}>
          <Text style={[styles.price, { fontFamily: fontFamily.bold }]}>£3.50</Text>
          <Text style={[styles.priceLabel, { fontFamily: fontFamily.regular }]}>per month · cancel anytime</Text>
        </View>

        {/* Feature comparison */}
        <View style={[styles.comparisonBox, { borderColor: colors.borderLight }]}>
          <View style={[styles.comparisonHeader, { borderBottomColor: colors.borderLight, backgroundColor: colors.borderLight }]}>
            <Text style={[styles.comparisonTitle, { color: colors.inkMid, fontFamily: fontFamily.regular }]}>FREE</Text>
            <Text style={[styles.comparisonTitle, { color: colors.accentGold, fontFamily: fontFamily.bold }]}>FULL</Text>
          </View>

          <View style={styles.comparisonBody}>
            <View style={styles.comparisonCol}>
              {FREE_FEATURES.map((f) => (
                <View key={f} style={styles.featureRow}>
                  <Ionicons name="checkmark" size={14} color={colors.inkLight} />
                  <Text style={[styles.featureText, { color: colors.inkLight, fontFamily: fontFamily.regular }]}>{f}</Text>
                </View>
              ))}
            </View>
            <View style={[styles.dividerV, { backgroundColor: colors.borderLight }]} />
            <View style={styles.comparisonCol}>
              {PAID_FEATURES.map((f) => (
                <View key={f} style={styles.featureRow}>
                  <Ionicons name="checkmark" size={14} color={colors.accentGold} />
                  <Text style={[styles.featureText, { color: colors.inkDark, fontFamily: fontFamily.regular }]}>{f}</Text>
                </View>
              ))}
            </View>
          </View>
        </View>

        {/* Subscribe button */}
        <TouchableOpacity style={[styles.subscribeButton, { backgroundColor: colors.accentGold }]} onPress={handleSubscribe}>
          <Text style={[styles.subscribeText, { fontFamily: fontFamily.bold }]}>Subscribe — £3.50/month</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={handleRestore} style={styles.restoreRow}>
          <Text style={[styles.restoreText, { color: colors.inkFaint, fontFamily: fontFamily.regular }]}>
            Restore purchase
          </Text>
        </TouchableOpacity>

        {/* Promo code */}
        <View style={[styles.promoSection, { borderTopColor: colors.borderLight }]}>
          {!promoVisible ? (
            <TouchableOpacity onPress={() => setPromoVisible(true)}>
              <Text style={[styles.promoToggle, { color: colors.inkFaint, fontFamily: fontFamily.regular }]}>
                Have a code?
              </Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.promoRow}>
              <TextInput
                style={[styles.promoInput, { color: colors.inkDark, borderColor: colors.borderMid, fontFamily: fontFamily.regular, backgroundColor: colors.card }]}
                value={promoInput}
                onChangeText={setPromoInput}
                placeholder="Enter code"
                placeholderTextColor={colors.inkFaint}
                autoCapitalize="characters"
                autoFocus
                onSubmitEditing={handlePromoSubmit}
              />
              <TouchableOpacity
                style={[styles.promoButton, { backgroundColor: colors.accentGold }]}
                onPress={handlePromoSubmit}
              >
                <Text style={[styles.promoButtonText, { fontFamily: fontFamily.regular }]}>Apply</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  closeButton: { position: 'absolute', right: 16, zIndex: 10 },
  content: { paddingHorizontal: Spacing.lg, paddingBottom: 48, gap: Spacing.lg },
  masthead: { textAlign: 'center', fontSize: 24, letterSpacing: 0.5 },
  rule: { height: 2, marginVertical: 4 },
  headline: { textAlign: 'center', lineHeight: 36 },
  subhead: { textAlign: 'center', lineHeight: 24 },
  priceCard: {
    borderRadius: 12,
    paddingVertical: Spacing.lg,
    alignItems: 'center',
  },
  price: { color: '#FFF', fontSize: 40, lineHeight: 46 },
  priceLabel: { color: '#FFFFFFCC', fontSize: 15 },
  comparisonBox: {
    borderWidth: 1,
    borderRadius: 10,
    overflow: 'hidden',
  },
  comparisonHeader: {
    flexDirection: 'row',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  comparisonTitle: {
    flex: 1,
    textAlign: 'center',
    paddingVertical: Spacing.sm,
    fontSize: 12,
    letterSpacing: 1,
  },
  comparisonBody: { flexDirection: 'row' },
  comparisonCol: { flex: 1, padding: Spacing.md, gap: Spacing.sm },
  dividerV: { width: StyleSheet.hairlineWidth },
  featureRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  featureText: { flex: 1, fontSize: 12, lineHeight: 18 },
  subscribeButton: {
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: 'center',
  },
  subscribeText: { color: '#FFF', fontSize: 17 },
  restoreRow: { alignItems: 'center' },
  restoreText: { fontSize: 13 },
  promoSection: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: Spacing.lg, alignItems: 'center' },
  promoToggle: { fontSize: 14 },
  promoRow: { flexDirection: 'row', gap: Spacing.sm, width: '100%' },
  promoInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    fontSize: 15,
    letterSpacing: 2,
  },
  promoButton: {
    borderRadius: 8,
    paddingHorizontal: Spacing.lg,
    paddingVertical: 10,
    justifyContent: 'center',
  },
  promoButtonText: { color: '#FFF', fontSize: 15 },
});
