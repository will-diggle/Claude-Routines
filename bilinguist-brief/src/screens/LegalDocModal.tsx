import React, { useState } from 'react';
import {
  Modal, ScrollView, View, Text, Image, TouchableOpacity,
  StyleSheet, Dimensions, Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { useTheme } from '../hooks/useTheme';
import Constants from 'expo-constants';
import legal from '../content/legal.json';

// ── Document type ─────────────────────────────────────────────────────────────

export type LegalDoc = 'privacy' | 'terms' | 'about';

// ── Static content ────────────────────────────────────────────────────────────
// Each section has an optional heading and an array of content items.
// ContentItem types:
//   { type: 'text'; text: string }       — body paragraph
//   { type: 'bullet'; text: string }     — indented bullet point (• prefix)
//   { type: 'label'; text: string }      — small bold sub-label (e.g. "Account data:")

type ContentItem =
  | { type: 'text';   text: string }
  | { type: 'bullet'; text: string }
  | { type: 'label';  text: string };

interface Section {
  heading?: string;
  items: ContentItem[];
}

interface DocContent {
  title: string;
  subtitle: string; // italic right side of meta row
  effectiveDate: string; // left side of meta row
  sections: Section[];
}

// Privacy Policy and Terms of Service come from src/content/legal.json, which
// must stay byte-identical to bilinguist-web/src/content/legal.json — the
// website renders the same file at bilinguistbrief.com/privacy/ and /terms/,
// which is what Settings and the sign-in screen actually link to. Edit both
// copies together, and bump TERMS_VERSION / PRIVACY_VERSION in
// useAuthStore.ts (and LEGAL_VERSIONS in bilinguist-web/src/lib/config.ts)
// when the substance changes.
const DOCS: Record<LegalDoc, DocContent> = {
  privacy: legal.privacy as DocContent,
  terms: legal.terms as DocContent,

  // ── About This App ───────────────────────────────────────────────────────
  about: {
    title: 'About Bilinguist Brief',
    subtitle: 'How it works',
    effectiveDate: '',
    sections: [
      {
        items: [
          { type: 'text', text: '[About content will be added here. Replace this section with the final content.]' },
        ],
      },
    ],
  },
};

const DOC_OPTIONS: { key: LegalDoc; label: string }[] = [
  { key: 'privacy', label: 'Privacy Policy' },
  { key: 'terms',   label: 'Terms of Service' },
  { key: 'about',   label: 'About This App' },
];

// ── Visual helpers (same as BriefingScreen) ───────────────────────────────────

const CRESTS: Record<string, ReturnType<typeof require>> = {
  cream:    require('../../assets/splash-crest-cream.png'),
  softGrey: require('../../assets/splash-crest-navy.png'),
  white:    require('../../assets/splash-crest-white.png'),
  night:    require('../../assets/splash-crest-black.png'),
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

const SW = Dimensions.get('window').width;
const APP_VERSION = Constants.expoConfig?.version ?? '1.0';

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  visible: boolean;
  initialDoc: LegalDoc;
  onClose: () => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function LegalDocModal({ visible, initialDoc, onClose }: Props) {
  const { colors, fontFamily, fontSize, background, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const [activeDoc, setActiveDoc] = useState<LegalDoc>(initialDoc);
  const [pickerVisible, setPickerVisible] = useState(false);

  // Sync to initialDoc whenever the modal opens
  React.useEffect(() => {
    if (visible) setActiveDoc(initialDoc);
  }, [visible, initialDoc]);

  const doc = DOCS[activeDoc];
  const chrome   = chromeColor(background);
  const hairline = hairlineColor(background);
  const activeLabel = DOC_OPTIONS.find(o => o.key === activeDoc)?.label ?? '';

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={[styles.container, { backgroundColor: colors.bg }]}>
        <ScrollView
          style={{ flex: 1, backgroundColor: colors.bg }}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 48 },
          ]}
          showsVerticalScrollIndicator={false}
        >
          {/* Cities row — "LEGAL & SUPPORT" in place of city names. Extra top
              padding here clears the floating back button now that the
              masthead (which used to provide that clearance) is gone. */}
          <View style={[styles.citiesWrap, { paddingTop: 40 }]}>
            <Text style={[styles.cities, { color: chrome, fontFamily: fontFamily.regular }]}>
              LEGAL & SUPPORT
            </Text>
          </View>

          {/* Thin rule */}
          <View style={[styles.ruleInset, { backgroundColor: hairline }]} />

          {/* Meta row: effective date (left) · subtitle italic (right) */}
          <View style={styles.metaRow}>
            <Text style={[styles.metaDate, { color: colors.inkMid, fontFamily: fontFamily.regular }]}>
              {doc.effectiveDate}
            </Text>
            <Text style={[styles.tagline, { color: colors.inkMid, fontFamily: fontFamily.italic }]}>
              {doc.subtitle}
            </Text>
          </View>

          {/* Edition row: doc picker (left) · app version (right) */}
          <View style={styles.editionRow}>
            <TouchableOpacity
              onPress={() => setPickerVisible(true)}
              activeOpacity={0.6}
              hitSlop={{ top: 8, bottom: 8, left: 4, right: 8 }}
              style={styles.editionLabelRow}
            >
              <Text style={[styles.editionLabel, { color: colors.inkMid, fontFamily: fontFamily.regular }]}>
                {activeLabel.toUpperCase()}
              </Text>
              <Ionicons name="chevron-down" size={11} color={colors.inkFaint} style={{ marginLeft: 3, marginTop: 1 }} />
            </TouchableOpacity>
            <Text style={[styles.editionLabel, { color: colors.inkFaint, fontFamily: fontFamily.regular, opacity: 0.5 }]}>
              V{APP_VERSION}
            </Text>
          </View>

          {/* Document title — headline style */}
          <View style={styles.titleWrap}>
            <Text style={[styles.docTitle, { color: colors.inkDark, fontFamily: fontFamily.bold, fontSize: fontSize.heading }]}>
              {doc.title}
            </Text>
          </View>

          {/* Body content */}
          <View style={styles.bodyWrap}>
            {doc.sections.map((section, si) => (
              <View key={si} style={styles.section}>
                {section.heading ? (
                  <Text style={[styles.sectionHeading, { color: colors.inkDark, fontFamily: fontFamily.bold, fontSize: fontSize.body }]}>
                    {section.heading}
                  </Text>
                ) : null}
                {section.items.map((item, ii) => {
                  const bodyStyle = { color: colors.inkMid, fontFamily: fontFamily.regular, fontSize: fontSize.body, lineHeight: fontSize.body * 1.65 };
                  if (item.type === 'bullet') {
                    return (
                      <View key={ii} style={styles.bulletRow}>
                        <Text style={[styles.bulletDot, { color: colors.inkMid, fontFamily: fontFamily.regular, fontSize: fontSize.body, lineHeight: fontSize.body * 1.65 }]}>•</Text>
                        <Text style={[styles.bulletText, bodyStyle]}>{item.text}</Text>
                      </View>
                    );
                  }
                  if (item.type === 'label') {
                    return (
                      <Text key={ii} style={[styles.itemLabel, { color: colors.inkDark, fontFamily: fontFamily.bold, fontSize: fontSize.body, lineHeight: fontSize.body * 1.55 }]}>
                        {item.text}
                      </Text>
                    );
                  }
                  return (
                    <Text key={ii} style={[styles.paragraph, bodyStyle]}>{item.text}</Text>
                  );
                })}
              </View>
            ))}
          </View>

          {/* Footer — crest + rule, same as briefing */}
          <View style={styles.footer}>
            <View style={[styles.footerRule, { backgroundColor: chrome }]} />
            <Image
              source={CRESTS[background] ?? CRESTS.cream}
              style={styles.footerCrest}
              resizeMode="contain"
            />
          </View>
        </ScrollView>

        {/* Status bar fade — same gradient as BriefingScreen */}
        <LinearGradient
          pointerEvents="none"
          colors={[colors.bg + 'CC', colors.bg + '55', colors.bg + '00'] as any}
          locations={[0, 0.65, 1]}
          style={[styles.statusFade, { height: insets.top + 28 }]}
        />

        {/* Back arrow — built directly on BlurView rather than the shared
            GlassButton: that component's native liquid-glass effect renders
            as fully invisible inside this screen's opaque (non-transparent)
            Modal, for reasons that don't reproduce in a transparent Modal
            like the Paywall's. BlurView doesn't depend on that and is proven
            reliable here. Rendered above the status-bar fade gradient. */}
        <TouchableOpacity
          onPress={onClose}
          style={[styles.backButton, { top: insets.top + 4 }]}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <View style={[styles.glassCircleBg, { backgroundColor: isDark ? 'rgba(40,40,40,0.80)' : 'rgba(255,255,255,0.80)' }]}>
            <BlurView intensity={isDark ? 60 : 70} tint={isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
          </View>
          <Ionicons name="chevron-back" size={18} color={colors.inkDark} style={styles.glassCircleIcon} />
        </TouchableOpacity>

        {/* Doc picker modal */}
        <Modal
          visible={pickerVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setPickerVisible(false)}
        >
          <TouchableOpacity
            style={styles.pickerBackdrop}
            activeOpacity={1}
            onPress={() => setPickerVisible(false)}
          >
            <TouchableOpacity activeOpacity={1} style={[styles.pickerSheet, { backgroundColor: colors.surface }]}>
              <View style={styles.pickerHeader}>
                <Text style={[styles.pickerTitle, { color: colors.inkDark, fontFamily: fontFamily.bold }]}>
                  Documents
                </Text>
                <TouchableOpacity onPress={() => setPickerVisible(false)} style={styles.pickerCloseButton} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                  <View style={[styles.glassCirclePickerBg, { backgroundColor: isDark ? 'rgba(40,40,40,0.80)' : 'rgba(255,255,255,0.80)' }]}>
                    <BlurView intensity={isDark ? 60 : 70} tint={isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
                  </View>
                  <Ionicons name="close" size={16} color={colors.inkDark} style={styles.glassCircleIcon} />
                </TouchableOpacity>
              </View>
              {DOC_OPTIONS.map((opt) => {
                const isActive = opt.key === activeDoc;
                return (
                  <TouchableOpacity
                    key={opt.key}
                    style={[styles.pickerOption, { borderBottomColor: colors.borderLight }]}
                    onPress={() => {
                      setActiveDoc(opt.key);
                      setPickerVisible(false);
                    }}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.pickerOptionText, { color: isActive ? colors.inkDark : colors.inkMid, fontFamily: isActive ? fontFamily.bold : fontFamily.regular }]}>
                      {opt.label}
                    </Text>
                    {isActive && <Ionicons name="checkmark" size={18} color={colors.inkDark} />}
                  </TouchableOpacity>
                );
              })}
            </TouchableOpacity>
          </TouchableOpacity>
        </Modal>
      </View>
    </Modal>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: {},

  backButton: {
    position: 'absolute',
    left: 12,
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
  glassCircleBg: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 16,
    overflow: 'hidden',
  },
  glassCircleIcon: {
    zIndex: 1,
  },
  pickerCloseButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 6,
  },
  glassCirclePickerBg: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 15,
    overflow: 'hidden',
  },

  citiesWrap: {
    width: SW,
    alignItems: 'center',
  },
  cities: {
    width: SW,
    textAlign: 'center',
    fontSize: 9,
    letterSpacing: 2.5,
    textTransform: 'uppercase',
    paddingTop: 2,
    paddingBottom: 6,
  },

  ruleInset: {
    height: 1,
    marginHorizontal: 8,
    marginVertical: 5,
    borderRadius: 1,
  },

  metaRow: {
    width: SW,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingTop: 5,
    paddingBottom: 8,
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

  editionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingTop: 8,
    paddingBottom: 8,
  },
  editionLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  editionLabel: {
    fontSize: 12,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },

  titleWrap: {
    paddingHorizontal: 18,
    paddingTop: 20,
    paddingBottom: 12,
  },
  docTitle: {},

  bodyWrap: {
    paddingHorizontal: 18,
  },
  section: {
    marginBottom: 20,
  },
  sectionHeading: {
    marginBottom: 10,
    letterSpacing: 0.2,
  },
  paragraph: {
    marginBottom: 14,
  },
  bulletRow: {
    flexDirection: 'row',
    marginBottom: 8,
    paddingLeft: 4,
  },
  bulletDot: {
    width: 16,
    marginTop: 1,
  },
  bulletText: {
    flex: 1,
  },
  itemLabel: {
    marginTop: 10,
    marginBottom: 6,
  },

  footer: {
    marginTop: 32,
    paddingHorizontal: 18,
    alignItems: 'center',
  },
  footerRule: {
    height: 1,
    width: '100%',
    opacity: 0.35,
  },
  footerCrest: {
    marginTop: 4,
    width: 108,
    height: 108,
    opacity: 0.28,
  },

  statusFade: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },

  pickerBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.82)',
    justifyContent: 'flex-end',
  },
  pickerSheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 16,
    paddingHorizontal: 20,
    paddingBottom: Platform.OS === 'ios' ? 36 : 24,
  },
  pickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  pickerTitle: {
    fontSize: 16,
    letterSpacing: 0.3,
  },
  pickerOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 15,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  pickerOptionText: {
    fontSize: 16,
  },
});
