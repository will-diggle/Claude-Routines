import React, { useState } from 'react';
import {
  Modal, ScrollView, View, Text, Image, TouchableOpacity,
  StyleSheet, Dimensions, Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../hooks/useTheme';
import Constants from 'expo-constants';

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

const DOCS: Record<LegalDoc, DocContent> = {

  // ── Privacy Policy ───────────────────────────────────────────────────────
  privacy: {
    title: 'Privacy Policy',
    subtitle: 'DRAFT — not yet finalized',
    effectiveDate: 'Last updated: [to be confirmed]',
    sections: [
      {
        items: [
          { type: 'text', text: 'DRAFT — working document, not yet finalized or legally reviewed.' },
        ],
      },
      {
        heading: '1. Who We Are',
        items: [
          { type: 'text', text: 'Bilinguist Brief is operated by William Diggle, an individual based in the United Kingdom ("we," "us," "our"). We are the data controller for the personal data described in this policy.' },
          { type: 'text', text: 'Contact: support@bilinguistbrief.com' },
        ],
      },
      {
        heading: '2. What Data We Collect',
        items: [
          { type: 'label',  text: 'Account data (via Supabase Authentication):' },
          { type: 'bullet', text: 'Your email address (for email sign-up) or identifiers provided by Apple/Google if you sign in that way.' },
          { type: 'bullet', text: 'Your name, only if you sign in with Apple or Google and choose to share it — used for display purposes only.' },
          { type: 'bullet', text: 'A unique account ID, generated automatically.' },
          { type: 'label',  text: 'App activity data (stored against your account):' },
          { type: 'bullet', text: 'Your reading streaks, per language, and the dates you have read a briefing.' },
          { type: 'bullet', text: 'Practice game scores and completion history.' },
          { type: 'bullet', text: 'Streak freeze usage.' },
          { type: 'bullet', text: 'Your language, level, and topic preferences.' },
          { type: 'text',   text: 'Words you look up or save (via our analytics provider — see Section 3) — including the specific word, the language, and your proficiency level.' },
          { type: 'text',   text: 'Location (optional): if you grant permission, we use your approximate location, in-memory only, to show local weather. This is never stored on our servers or your device beyond the current app session.' },
          { type: 'text',   text: 'We do not collect your precise location for any other purpose, and we do not store your device timezone.' },
        ],
      },
      {
        heading: '3. Third Parties We Share Data With',
        items: [
          { type: 'text',   text: 'We use a small number of service providers to run the App. None of them are permitted to use your data for their own purposes beyond providing their service to us.' },
          { type: 'bullet', text: 'Supabase — hosts your account and app activity data described in Section 2. [Data centre region to be confirmed — Supabase account settings.]' },
          { type: 'bullet', text: 'PostHog (EU-hosted analytics) — receives app usage events, including which words you tap, save, or look up, your subscription status, and general app usage (screens viewed, games played, streaks). Identified either by your account ID or, if not signed in, an anonymous device identifier.' },
          { type: 'bullet', text: 'RevenueCat (once integrated) — will process your subscription and purchase status to manage your Premium subscription.' },
          { type: 'bullet', text: 'Google Gemini — used only in our backend content pipeline to help write briefings. No personal user data is sent to Gemini.' },
          { type: 'bullet', text: 'Anthropic (Claude) — when you tap a word for an explanation, the word, surrounding sentence, language, and your CEFR level are sent to Anthropic to generate an explanation. No account ID or other identifying information is included in this request.' },
          { type: 'bullet', text: 'Google Translate API — when you look up a word, the word and source language are sent to Google to provide a translation and a per-word audio pronunciation. No personal data is included in this request.' },
          { type: 'bullet', text: 'Open-Meteo — if you grant location permission, your approximate coordinates are sent to Open-Meteo to retrieve local weather. Not stored by us.' },
          { type: 'bullet', text: 'Apple — processes your subscription payment directly; we do not see or store your payment details.' },
        ],
      },
      {
        heading: '4. Legal Basis for Processing (UK GDPR)',
        items: [
          { type: 'text', text: 'We process your data on the following bases: performance of a contract (to provide the App and your subscription), legitimate interests (to understand app usage and improve the service), and consent (for optional features such as location access and marketing communications).' },
        ],
      },
      {
        heading: '5. Marketing Communications',
        items: [
          { type: 'text', text: 'We will only send you marketing emails if you opt in (for example, via a clearly unticked checkbox at sign-up). Every marketing email includes an unsubscribe link, and you can withdraw consent at any time.' },
        ],
      },
      {
        heading: "6. Children's Privacy",
        items: [
          { type: 'text', text: 'The App is intended for users aged 13 and over. We do not knowingly collect more personal data from users under 18 than is necessary to provide the App, and we do not use profiling or targeted advertising directed at users under 18. Our friends feature does not include messaging and relies on username search (not open discovery) with mandatory request-acceptance, to reduce the risk of unwanted contact for younger users.' },
        ],
      },
      {
        heading: '7. Data Retention',
        items: [
          { type: 'text', text: 'Account and app activity data is retained for as long as your account is active. If you request account deletion, we will delete your personal data within 30 days. Reading history is retained without a fixed time limit while your account remains active, as it directly supports the streak and progress features of the App; you can request its deletion at any time by deleting your account.' },
          { type: 'text', text: 'Our payment processor (Apple, via RevenueCat once integrated) may retain transaction records for longer, as required by law for financial and tax record-keeping purposes — this is outside our control.' },
          { type: 'text', text: '[Open item: account deletion is not yet built into the App. Once available, requesting deletion will remove your Supabase account and associated data, reset your identifier with our analytics provider, and stop any further processing. Until then, please contact support@bilinguistbrief.com to request deletion manually.]' },
        ],
      },
      {
        heading: '8. Your Rights',
        items: [
          { type: 'text',   text: 'Under UK GDPR, you have the right to:' },
          { type: 'bullet', text: 'Access the personal data we hold about you;' },
          { type: 'bullet', text: 'Request correction of inaccurate data;' },
          { type: 'bullet', text: 'Request deletion of your data;' },
          { type: 'bullet', text: 'Request a copy of your data in a portable format;' },
          { type: 'bullet', text: 'Object to or restrict certain processing;' },
          { type: 'bullet', text: 'Withdraw consent at any time where processing is based on consent.' },
          { type: 'text',   text: "To exercise any of these rights, contact us at support@bilinguistbrief.com. You also have the right to complain to the Information Commissioner's Office (ICO) if you believe we have not handled your data properly." },
        ],
      },
      {
        heading: '9. International Data Transfers',
        items: [
          { type: 'text', text: "Some of our service providers may process data outside the UK. Where this happens, we rely on appropriate safeguards such as Standard Contractual Clauses or the provider's own adequacy protections. [Open item: to be finalised once Supabase's hosting region and each provider's transfer mechanism are confirmed.]" },
        ],
      },
      {
        heading: '10. Security',
        items: [
          { type: 'text', text: "Data is encrypted in transit (HTTPS) and at rest, using Supabase's built-in security features. Access to our systems is restricted to us as the App's sole developer. We do not share access with any party beyond the service providers listed in Section 3." },
        ],
      },
      {
        heading: '11. Changes to This Policy',
        items: [
          { type: 'text', text: 'We may update this policy from time to time. If we make material changes, we will notify you by email or an in-app notice, and update the "last updated" date above.' },
        ],
      },
      {
        heading: '12. Contact Us',
        items: [
          { type: 'text', text: 'If you have questions about this policy or how your data is handled, please contact us at support@bilinguistbrief.com.' },
        ],
      },
      {
        items: [
          { type: 'text', text: 'Open items still to confirm before publishing: Supabase data centre region; account deletion flow needs to be built (currently manual via support email); international transfer mechanisms per provider; final review by a qualified solicitor before public launch.' },
        ],
      },
    ],
  },

  // ── Terms of Service ─────────────────────────────────────────────────────
  terms: {
    title: 'Terms of Service',
    subtitle: 'DRAFT — not yet finalized',
    effectiveDate: 'Last updated: [to be confirmed]',
    sections: [
      {
        items: [
          { type: 'text', text: 'DRAFT — working document, not yet finalized or legally reviewed.' },
        ],
      },
      {
        heading: '1. Acceptance of These Terms',
        items: [
          { type: 'text', text: 'By creating an account or using Bilinguist Brief (the "App"), you agree to these Terms of Service. If you do not agree, please do not use the App.' },
          { type: 'text', text: "You must be at least 13 years old to create an account. If you are under 18, you confirm you have your parent or guardian's permission to use the App." },
        ],
      },
      {
        heading: '2. Description of the Service',
        items: [
          { type: 'text', text: 'Bilinguist Brief provides daily, AI-generated multilingual news briefings written at your chosen language proficiency level (CEFR A1–C2, plus a Native journalism tier), along with vocabulary tools including tap-to-translate, flashcards, and language practice games.' },
          { type: 'text', text: 'All briefing content is original writing, generated by AI based on publicly available facts and current events. Briefings are not reproductions of any third-party news article, and the App does not claim affiliation with, or endorsement by, any news outlet.' },
          { type: 'text', text: 'The App may include coverage of real-world events, including difficult or distressing subject matter (for example, conflict, disasters, or loss of life), as this reflects genuine current affairs. Please use discretion, particularly for younger users.' },
        ],
      },
      {
        heading: '3. Accuracy of Content',
        items: [
          { type: 'text', text: 'While we aim for factual accuracy, briefings are generated by AI and rewritten for language-learning purposes. We do not guarantee that any briefing is complete, current, or free of error, and the App should not be relied upon as your sole source of news or as professional, medical, legal, or financial advice.' },
        ],
      },
      {
        heading: '4. Accounts',
        items: [
          { type: 'bullet', text: 'You are responsible for maintaining the confidentiality of your account credentials.' },
          { type: 'bullet', text: 'You agree to provide accurate information when creating an account.' },
          { type: 'bullet', text: 'Each account is intended for a single individual; do not share your account or create accounts on behalf of others without permission.' },
          { type: 'bullet', text: 'You may delete your account at any time by contacting support@bilinguistbrief.com. See our Privacy Policy for details on what happens to your data on deletion.' },
        ],
      },
      {
        heading: '5. Subscriptions & Billing',
        items: [
          { type: 'text', text: 'Bilinguist Brief offers a free tier and a paid subscription tier ("Premium").' },
          { type: 'text', text: 'Free tier: includes one pre-selected language plus English, in short-form/global news briefings only; a second topic available in English only; access to all practice games (limited to a small number of games per day); and a limited number of daily word translations and saves.' },
          { type: 'text', text: "Premium tier: £3.50 per month, unlocks full-length briefings, all CEFR proficiency levels, and unlocked topics across all your active languages. Streak tracking and streak freezes are free for all users regardless of tier." },
          { type: 'text', text: 'New subscribers receive a 7-day free trial. If you do not cancel before the trial ends, your subscription will begin and payment will be charged to your Apple ID account.' },
          { type: 'text', text: "Subscriptions automatically renew each month unless cancelled at least 24 hours before the end of the current billing period. You can manage or cancel your subscription at any time via your Apple ID account settings. Cancellation takes effect at the end of the current billing period; we do not provide partial refunds for unused time." },
          { type: 'text', text: "We may change subscription pricing from time to time. Any price change will be communicated in advance in accordance with Apple's standard price-change notification process, and will not affect your current billing period." },
        ],
      },
      {
        heading: '6. Acceptable Use',
        items: [
          { type: 'text',   text: 'When using the App, including the friends feature, you agree not to:' },
          { type: 'bullet', text: 'Impersonate another person, or use a username intended to mislead or deceive other users;' },
          { type: 'bullet', text: "Scrape, reverse engineer, decompile, or attempt to extract the App's source code, prompts, or underlying data;" },
          { type: 'bullet', text: 'Use automated means (bots, scripts) to access or interact with the App;' },
          { type: 'bullet', text: "Harass, abuse, or attempt to repeatedly contact another user against their wishes;" },
          { type: 'bullet', text: "Attempt to gain unauthorized access to any part of the App, its data, or other users' accounts." },
          { type: 'text',   text: 'We reserve the right to suspend or terminate any account that violates these terms.' },
        ],
      },
      {
        heading: '7. Friends Feature',
        items: [
          { type: 'text', text: "The App allows users to add friends via username search or a shareable link, and to view a friend's reading streaks and active languages. The friends feature does not include messaging or direct communication between users. Friend requests must be accepted before any streak information is shared. You may remove a friend or decline a request at any time." },
        ],
      },
      {
        heading: '8. Intellectual Property',
        items: [
          { type: 'text', text: 'The App, including its design, branding, software, and all briefing content, is owned by William Diggle ("we," "us") or our licensors. You may use the App for personal, non-commercial language learning only. You may not copy, redistribute, publicly republish, or create derivative works from briefing content or any other part of the App without our prior written permission.' },
        ],
      },
      {
        heading: '9. Limitation of Liability',
        items: [
          { type: 'text', text: 'The App is provided "as is" without warranties of any kind, express or implied. To the fullest extent permitted by law, we are not liable for any indirect, incidental, or consequential damages arising from your use of the App, including but not limited to reliance on briefing content, service interruptions, or data loss. Nothing in these Terms excludes liability that cannot be excluded under applicable law.' },
        ],
      },
      {
        heading: '10. Termination',
        items: [
          { type: 'text', text: 'You may stop using the App and delete your account at any time. We may suspend or terminate your access to the App if we reasonably believe you have violated these Terms, engaged in abusive behaviour, or if required to do so by law.' },
        ],
      },
      {
        heading: '11. Governing Law',
        items: [
          { type: 'text', text: 'These Terms are governed by the laws of England and Wales. Any disputes arising from these Terms or your use of the App will be subject to the exclusive jurisdiction of the courts of England and Wales.' },
        ],
      },
      {
        heading: '12. Changes to These Terms',
        items: [
          { type: 'text', text: 'We may update these Terms from time to time. If we make material changes, we will notify you by email or an in-app notice. Continued use of the App after changes take effect constitutes acceptance of the updated Terms.' },
        ],
      },
      {
        heading: '13. Contact Us',
        items: [
          { type: 'text', text: 'If you have any questions about these Terms, please contact us at support@bilinguistbrief.com.' },
        ],
      },
      {
        items: [
          { type: 'text', text: 'Open items still to confirm before publishing: exact daily word-lookup and game limits (currently described in general terms so they can be tuned without a legal-doc update); Supabase hosting region reference if it needs to appear in a linked Privacy Policy; final review by a qualified solicitor before public launch.' },
        ],
      },
    ],
  },

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

const MASTHEADS: Record<string, ReturnType<typeof require>> = {
  cream:    require('../../assets/masthead-cream.png'),
  softGrey: require('../../assets/masthead-navy.png'),
  white:    require('../../assets/masthead-white.png'),
  night:    require('../../assets/masthead-black.png'),
};
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
const LOCKUP_PADDING = 4;
const LOCKUP_W = SW - LOCKUP_PADDING * 2;
const LOCKUP_H = Math.round(LOCKUP_W / 5.17);
const APP_VERSION = Constants.expoConfig?.version ?? '1.0';

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  visible: boolean;
  initialDoc: LegalDoc;
  onClose: () => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function LegalDocModal({ visible, initialDoc, onClose }: Props) {
  const { colors, fontFamily, fontSize, background } = useTheme();
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
        {/* Back arrow — floats above masthead like BriefingScreen's page dots */}
        <TouchableOpacity
          onPress={onClose}
          style={[styles.backButton, { top: insets.top + 4 }]}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="chevron-back" size={24} color={chrome} />
        </TouchableOpacity>

        <ScrollView
          style={{ flex: 1, backgroundColor: colors.bg }}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 48 },
          ]}
          showsVerticalScrollIndicator={false}
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

          {/* Cities row — "LEGAL & SUPPORT" in place of city names */}
          <View style={styles.citiesWrap}>
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

          {/* Thick chrome rule */}
          <View style={[styles.ruleOuterInset, { backgroundColor: chrome }]} />

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
                <TouchableOpacity onPress={() => setPickerVisible(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                  <Ionicons name="close" size={20} color={colors.inkFaint} />
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
    padding: 8,
  },

  lockupWrap: {
    width: SW,
    paddingHorizontal: LOCKUP_PADDING,
    paddingTop: 4,
    paddingBottom: 2,
  },
  lockup: {
    width: LOCKUP_W,
    height: LOCKUP_H,
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
  ruleOuterInset: {
    height: 1.5,
    marginHorizontal: 8,
    marginVertical: 2,
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
