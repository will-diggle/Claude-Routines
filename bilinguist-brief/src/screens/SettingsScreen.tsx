import React, { useState, useCallback, useEffect, useRef } from 'react';

// Length picker labels localised to each target language
const LENGTH_LABELS: Record<string, readonly [string, string]> = {
  fr: ['Concis',  'Long'],
  de: ['Kurz',    'Lang'],
  sv: ['Kort',    'Lång'],
  en: ['Concise', 'Long'],
  it: ['Conciso', 'Lungo'],
  es: ['Conciso', 'Extenso'],
  tr: ['Kısa',    'Uzun'],
};
import { SafeAreaView } from 'react-native-safe-area-context';
import { FLOAT_TAB_INSET } from '../components/FloatingTabBar';
import {
  View,
  Text,
  Image,
  ScrollView,
  TouchableOpacity,
  Switch,
  TextInput,
  Modal,
  Alert,
  StyleSheet,
  Platform,
  Dimensions,
  Linking,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';

import { Ionicons } from '@expo/vector-icons';
import { DraggableList } from '../components/DraggableList';
import { useSettingsStore, LEVELS_BY_LANG, LanguageLevel, type ReadLength } from '../store/useSettingsStore';
import { useBriefingStore } from '../store/useBriefingStore';
import type { ArticleLength } from '../services/anthropic';
import { NATIVE_WRITING_LEVEL } from '../services/prompts';
import { useSubscriptionStore } from '../store/useSubscriptionStore';
import { useNavPillStore, type SettingsSection } from '../store/useNavPillStore';
import { useTheme } from '../hooks/useTheme';
import { scheduleBriefingNotification, schedulePracticeNotification } from '../services/notifications';
import { getDailyUsage, resetDailyUsage } from '../services/apiUsage';
import { getTodayFactbase } from '../services/factbase';
import {
  FontFamilies,
  FontSizes,
  BackgroundColors,
  Colors,
  Spacing,
  type BackgroundKey,
  type FontFamilyKey,
  type FontSizeKey,
} from '../theme';
import { TopBar } from '../components/TopBar';
import { useAuthStore } from '../store/useAuthStore';
import { useStreakStore } from '../store/useStreakStore';
import { supabase } from '../services/supabase';
import * as AppleAuthentication from 'expo-apple-authentication';
import { StreakCalendar, FullStreakCalendar } from '../components/StreakCalendar';
import { useShallow } from 'zustand/react/shallow';
// expo-dynamic-app-icon is not available in Expo Go — lazy require so it fails
// gracefully rather than crashing the whole module on load.
let setNativeAppIcon: (icon: string) => void = () => {};
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  setNativeAppIcon = require('expo-dynamic-app-icon').setAppIcon;
} catch { /* not available in Expo Go */ }
import * as analytics from '../services/analytics';

const SCREEN_WIDTH = Dimensions.get('window').width;
const SCREEN_HEIGHT = Dimensions.get('window').height;

// Pairs for auto day/night icon switching
const ICON_PAIRS: { light: string | null; dark: string }[] = [
  { light: null,     dark: 'Black'  }, // White ↔ Black
  { light: 'Cream',  dark: 'Navy'   }, // Cream ↔ Navy
  { light: 'Pride1', dark: 'Pride2' }, // Pride ↔ Pride 2
];

function getAutoIcon(base: string | null, dark: boolean): string | null {
  const pair = ICON_PAIRS.find(p => p.light === base || p.dark === base);
  if (!pair) return base;
  return dark ? pair.dark : pair.light;
}

function applyNativeIcon(name: string | null) {
  try {
    setNativeAppIcon(name ?? '');
  } catch {
    // Silently ignore — icon stays unchanged if native call fails
  }
}

const APP_ICONS: { name: string | null; label: string; image: ReturnType<typeof require> }[] = [
  { name: null,     label: 'White',   image: require('../../assets/icon-white.png')   },
  { name: 'Black',  label: 'Black',   image: require('../../assets/icon-black.png')   },
  { name: 'Cream',  label: 'Cream',   image: require('../../assets/icon-cream.png')   },
  { name: 'Navy',   label: 'Navy',    image: require('../../assets/icon-navy.png')    },
  { name: 'Pride1', label: 'Pride',   image: require('../../assets/icon-pride-1.png') },
  { name: 'Pride2', label: 'Pride 2', image: require('../../assets/icon-pride-2.png') },
];

const SECTIONS: SettingsSection[] = ['languages', 'genres', 'display', 'profile'];
const SECTION_TO_INDEX: Record<SettingsSection, number> = {
  languages: 0, genres: 1, display: 2, profile: 3,
};


// Canonical CEFR ordering — used to position 'Native' dynamically.
const CEFR_ORDER = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const;
type CefrLevel = typeof CEFR_ORDER[number];

// Localised word for "Native" in each language — used when building the label.
const NATIVE_WORD: Record<string, string> = {
  en: 'Native', fr: 'Natif', de: 'Muttersprachlich',
  es: 'Nativo', it: 'Madrelingua', sv: 'Modersmål',
};

// Build the "B2 / Native" style label using today's graded CEFR level.
// Falls back to NATIVE_WRITING_LEVEL (C1) if no grading data is available.
function nativeLabel(langCode: string, grade?: LanguageLevel): string {
  const g = grade ?? NATIVE_WRITING_LEVEL;
  return `${g} / ${NATIVE_WORD[langCode] ?? 'Native'}`;
}

// Return the ordered level list for the modal. Uses today's bundle-derived
// available levels (CEFR levels actually generated + Native if present),
// falling back to the hardcoded LEVELS_BY_LANG if the bundle hasn't loaded yet.
// Native is always last. No challenge labels — skipped levels simply don't appear.
function orderedLevels(langCode: string, available?: LanguageLevel[]): LanguageLevel[] {
  if (available && available.length > 0) return available;
  return LEVELS_BY_LANG[langCode] ?? [];
}

const BACKGROUNDS: { key: BackgroundKey; label: string; color: string; ink: string }[] = [
  { key: 'white',    label: 'White', color: Colors.white,   ink: Colors.inkDark },
  { key: 'cream',    label: 'Cream', color: Colors.cream,   ink: Colors.navyBg  },
  { key: 'softGrey', label: 'Navy',  color: '#162032',      ink: Colors.cream   },
  { key: 'night',    label: 'Night', color: Colors.night,   ink: Colors.cream   },
];
const FONT_SIZES: FontSizeKey[] = ['small', 'medium', 'large', 'extraLarge'];
const ALL_TOPIC_ITEMS: { key: string; label: string; comingSoon?: boolean }[] = [
  { key: 'worldNews',   label: 'Global News' },
  { key: 'ukPolitics',  label: 'UK Politics' },
  { key: 'business',    label: 'Business & Economy' },
  { key: 'europe',      label: 'Europe' },
  { key: 'politics',    label: 'Politics',             comingSoon: true },
  { key: 'scienceTech', label: 'Science & Technology', comingSoon: true },
  { key: 'artsCulture', label: 'Arts & Culture',       comingSoon: true },
  { key: 'asia',        label: 'Asia',                 comingSoon: true },
  { key: 'middleEast',  label: 'Middle East',          comingSoon: true },
  { key: 'africa',      label: 'Africa',               comingSoon: true },
  { key: 'goodNews',    label: 'Good News',            comingSoon: true },
];
const TOPIC_LABEL_MAP: Record<string, string> = Object.fromEntries(
  ALL_TOPIC_ITEMS.map((t) => [t.key, t.label])
);
const DEV_CODE = 'BILDEV';

// --- Sub-components ---

function SectionHeader({ title, colors, fontFamily }: { title: string; colors: any; fontFamily: any }) {
  return (
    <View style={[sectionStyles.header, { borderBottomColor: colors.borderMid }]}>
      <Text style={[sectionStyles.title, { color: colors.inkDark, fontFamily: fontFamily.bold }]}>
        {title}
      </Text>
    </View>
  );
}

function SegmentedControl({
  options,
  value,
  onChange,
  colors,
  fontFamily,
}: {
  options: { label: string; value: string; optionFontSize?: number }[];
  value: string;
  onChange: (v: string) => void;
  colors: any;
  fontFamily: any;
}) {
  return (
    <View style={[segStyles.container, { borderColor: colors.borderMid, backgroundColor: colors.bg }]}>
      {options.map((opt, i) => {
        const selected = opt.value === value;
        return (
          <TouchableOpacity
            key={opt.value}
            style={[
              segStyles.option,
              selected && { backgroundColor: colors.chrome },
              i > 0 && { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: colors.borderMid },
            ]}
            onPress={() => onChange(opt.value)}
          >
            <Text
              style={[
                segStyles.label,
                {
                  fontFamily: selected ? fontFamily.bold : fontFamily.regular,
                  color: selected ? colors.bg : colors.inkMid,
                  fontSize: opt.optionFontSize ?? 13,
                  lineHeight: (opt.optionFontSize ?? 13) * 1.2,
                },
              ]}
            >
              {opt.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function TimeInput({
  value,
  onChange,
  onCommit,
  colors,
  fontFamily,
}: {
  value: string;
  onChange: (v: string) => void;
  onCommit?: () => void;
  colors: any;
  fontFamily: any;
}) {
  return (
    <TextInput
      style={[
        timeStyles.input,
        { color: colors.inkDark, borderColor: colors.borderMid, fontFamily: fontFamily.regular, backgroundColor: colors.card },
      ]}
      value={value}
      onChangeText={(text) => {
        const clean = text.replace(/[^0-9:]/g, '');
        onChange(clean);
      }}
      onEndEditing={onCommit}
      placeholder="HH:MM"
      placeholderTextColor={colors.inkFaint}
      keyboardType="numbers-and-punctuation"
      maxLength={5}
    />
  );
}

function DisplayPreview({ colors, fontFamily, fontSize }: { colors: any; fontFamily: any; fontSize: any }) {
  return (
    <View style={[previewStyles.container, { backgroundColor: colors.bg, borderColor: colors.borderLight }]}>
      <Text style={[previewStyles.label, { color: colors.inkFaint, fontFamily: fontFamily.regular }]}>
        PREVIEW
      </Text>
      <Text style={[previewStyles.headline, { color: colors.inkDark, fontFamily: fontFamily.bold, fontSize: fontSize.heading * 0.75 }]}>
        La politique étrangère en débat
      </Text>
      <Text style={[previewStyles.body, { color: colors.inkMid, fontFamily: fontFamily.regular, fontSize: fontSize.body * 0.85 }]}>
        Les dirigeants mondiaux se sont réunis à Genève pour discuter des nouvelles mesures climatiques dans un contexte de tensions géopolitiques croissantes.
      </Text>
    </View>
  );
}

// --- Main screen ---

export function SettingsScreen() {
  const { colors, fontFamily, fontSize, isDark } = useTheme();
  const store = useSettingsStore();
  const { loadBriefing, nativeGradeByLang, availableLevelsByLang } = useBriefingStore();
  const { setDev, applyPromoCode, status } = useSubscriptionStore();
  const { settingsSection: activeTab, setSettingsSection } = useNavPillStore();
  const [isDragging, setIsDragging] = useState(false);
  const [devModalVisible, setDevModalVisible] = useState(false);
  const [devCodeInput, setDevCodeInput] = useState('');
  const [levelModalLang, setLevelModalLang] = useState<string | null>(null);
  const [usageLabel, setUsageLabel] = useState('');
  const [isForceRegenerating, setIsForceRegenerating] = useState(false);

  // Profile page state
  const [settingsSheetVisible, setSettingsSheetVisible] = useState(false);
  const [viewAllVisible, setViewAllVisible] = useState(false);
  const [usernameModalVisible, setUsernameModalVisible] = useState(false);
  const [usernameInput, setUsernameInput] = useState('');
  const [filterLang, setFilterLang] = useState<string>('all');

  // Streak store
  const readingHistory = useStreakStore((s) => s.readingHistory);
  const readingStreaks = useStreakStore((s) => s.readingStreaks);

  // Username from settings
  const username = useSettingsStore((s) => s.username);
  const setUsername = useSettingsStore((s) => s.setUsername);

  // Active languages for filter chips
  const activeLanguages = useSettingsStore(useShallow((s) => s.languages.filter((l) => l.active)));
  const maxStreak = activeLanguages.length > 0
    ? Math.max(...activeLanguages.map((l) => readingStreaks[l.code] ?? 0))
    : 0;

  // Auth
  const { session, setSession, signOut } = useAuthStore();
  const isSignedIn = !!session;
  const displayName = session?.user?.user_metadata?.full_name ?? session?.user?.user_metadata?.name ?? null;
  const userEmail = session?.user?.email ?? null;
  const [signInModalVisible, setSignInModalVisible] = useState(false);
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [appleAvailable, setAppleAvailable] = useState(false);

  useEffect(() => {
    AppleAuthentication.isAvailableAsync().then(setAppleAvailable).catch(() => {});
  }, []);

  // Auto day/night icon — apply the correct variant whenever dark mode or the toggle changes
  useEffect(() => {
    if (!store.appIconAuto) return;
    applyNativeIcon(getAutoIcon(store.appIcon, isDark));
  }, [store.appIconAuto, store.appIcon, isDark]);

  async function handleAppleSignIn() {
    if (!supabase) { setAuthError('Supabase not configured — add credentials to .env'); return; }
    setAuthLoading(true);
    setAuthError(null);
    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
      if (!credential.identityToken) throw new Error('No identity token from Apple');
      const { data, error } = await supabase.auth.signInWithIdToken({
        provider: 'apple',
        token: credential.identityToken,
      });
      if (error) throw error;
      if (data.session) {
        setSession(data.session);
        analytics.trackUserLoggedIn();
      }
      setSignInModalVisible(false);
    } catch (e: any) {
      if (e?.code !== 'ERR_REQUEST_CANCELED') {
        setAuthError(e?.message ?? 'Apple sign-in failed');
      }
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleGoogleSignIn() {
    if (!supabase) { setAuthError('Supabase not configured — add credentials to .env'); return; }
    setAuthLoading(true);
    setAuthError(null);
    try {
      const { data } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { skipBrowserRedirect: true },
      });
      if (data?.url) Linking.openURL(data.url);
      setSignInModalVisible(false);
    } catch (e: any) {
      setAuthError(e?.message ?? 'Google sign-in failed');
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleEmailAuth() {
    if (!authEmail.trim() || !authPassword) return;
    if (!supabase) { setAuthError('Supabase not configured — add credentials to .env'); return; }
    setAuthLoading(true);
    setAuthError(null);
    try {
      if (authMode === 'signin') {
        const { data, error } = await supabase.auth.signInWithPassword({ email: authEmail.trim(), password: authPassword });
        if (error) throw error;
        if (data.session) {
          setSession(data.session);
          analytics.trackUserLoggedIn();
        }
      } else {
        const { data, error } = await supabase.auth.signUp({ email: authEmail.trim(), password: authPassword });
        if (error) throw error;
        if (data.session) {
          setSession(data.session);
          analytics.trackUserSignedUp();
        } else {
          Alert.alert('Check your email', 'We sent you a confirmation link — click it to activate your account.');
        }
      }
      setSignInModalVisible(false);
      setAuthEmail('');
      setAuthPassword('');
    } catch (e: any) {
      setAuthError(e?.message ?? 'Authentication failed');
    } finally {
      setAuthLoading(false);
    }
  }

  const pagerRef = useRef<ScrollView>(null);
  const programmaticScrollRef = useRef(false);

  useEffect(() => {
    if (store.developerMode) {
      getDailyUsage().then(({ used, limit }) => setUsageLabel(`${used}/${limit} briefings today`)).catch(() => {});
    }
  }, [store.developerMode]);

  // Sync pager position when pill chip is tapped
  useEffect(() => {
    const idx = SECTION_TO_INDEX[activeTab] ?? 0;
    programmaticScrollRef.current = true;
    pagerRef.current?.scrollTo({ x: idx * SCREEN_WIDTH, animated: true });
    const t = setTimeout(() => { programmaticScrollRef.current = false; }, 500);
    return () => clearTimeout(t);
  }, [activeTab]);

  const handlePageScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (programmaticScrollRef.current) return;
    const page = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
    const section = SECTIONS[page];
    if (section && section !== activeTab) setSettingsSection(section);
  }, [activeTab, setSettingsSection]);

  function handleDevTap() {
    if (store.developerMode) {
      store.setDeveloperMode(false);
      setDev(false);
      return;
    }
    setDevCodeInput('');
    setDevModalVisible(true);
  }

  function handleDevCodeSubmit() {
    if (devCodeInput.trim().toUpperCase() === DEV_CODE) {
      store.setDeveloperMode(true);
      setDev(true);
      setDevModalVisible(false);
    } else {
      Alert.alert('Incorrect code', 'Please try again.');
      setDevCodeInput('');
    }
  }

  const COMING_SOON_KEYS = new Set(ALL_TOPIC_ITEMS.filter((t) => t.comingSoon).map((t) => t.key));
  const topicItems = (store.topicOrder ?? ALL_TOPIC_ITEMS.map((t) => t.key)).map((key) => ({
    key,
    label: TOPIC_LABEL_MAP[key] ?? key,
    comingSoon: COMING_SOON_KEYS.has(key),
  }));

  const levelModal = store.languages.find((l) => l.code === levelModalLang);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={[]}>
      <TopBar />
      {/* Horizontal pager */}
      <ScrollView
        ref={pagerRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={32}
        onMomentumScrollEnd={handlePageScroll}
        style={{ flex: 1 }}
        overScrollMode="never"
        scrollEnabled={!isDragging}
      >
        {/* ── Page 0: Languages ── */}
        <ScrollView
          style={[styles.pageScroll, { backgroundColor: colors.bg }]}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          scrollEnabled={!isDragging}
          directionalLockEnabled
          showsVerticalScrollIndicator={false}
        >
          <SectionHeader title="Language Preferences" colors={colors} fontFamily={fontFamily} />

          <Text style={[styles.helper, { color: colors.inkFaint, fontFamily: fontFamily.regular }]}>
            Toggle languages on to include them in your briefing.
          </Text>

          <DraggableList
            items={store.languages}
            keyExtractor={(lang) => lang.code}
            itemHeight={56}
            onReorder={store.reorderLanguages}
            onDragStateChange={setIsDragging}
            renderItem={(lang, index, isAnyDragging) => (
              <View>
                <View style={[styles.row, { borderBottomColor: colors.borderLight }]}>
                  <Ionicons name="reorder-three-outline" size={20} color={colors.inkFaint} style={{ marginRight: 4 }} />
                  <Text style={[styles.rowLabel, { color: colors.inkDark, fontFamily: fontFamily.regular, fontSize: fontSize.body }]}>
                    {lang.nativeName}
                  </Text>
                  <Switch
                    value={lang.active}
                    onValueChange={() => {
                    const wasActive = lang.active;
                    store.toggleLanguage(lang.code);
                    if (wasActive) analytics.trackLanguageRemoved(lang.code);
                    else analytics.trackLanguageAdded(lang.code);
                  }}
                    trackColor={{ false: isDark ? 'rgba(255,255,255,0.20)' : colors.borderMid, true: colors.chrome }}
                    thumbColor="#FFF"
                  />
                </View>
                {lang.active && !isAnyDragging && (
                  <>
                    <TouchableOpacity
                      style={[styles.levelRow, { borderBottomColor: colors.borderLight, backgroundColor: colors.surface }]}
                      onPress={() => setLevelModalLang(lang.code)}
                    >
                      <Text style={[styles.levelLabel, { color: colors.inkLight, fontFamily: fontFamily.regular }]}>
                        Level
                      </Text>
                      <Text style={[styles.levelValue, { color: colors.inkDark, fontFamily: fontFamily.bold }]}>
                        {lang.level === 'Native' ? nativeLabel(lang.code, nativeGradeByLang[lang.code]) : lang.level}
                      </Text>
                      <Ionicons name="chevron-forward" size={16} color={colors.inkFaint} />
                    </TouchableOpacity>
                    <View style={[styles.levelRow, { borderBottomColor: colors.borderLight, backgroundColor: colors.surface }]}>
                      <Text style={[styles.levelLabel, { color: colors.inkLight, fontFamily: fontFamily.regular }]}>
                        Length
                      </Text>
                      <View style={{ flexDirection: 'row', gap: 6 }}>
                        {(['short', 'longer'] as const).map((val, i) => {
                          const label = (LENGTH_LABELS[lang.code] ?? LENGTH_LABELS.en)[i];
                          const active = (lang.readLength ?? 'medium') === val;
                          return (
                            <TouchableOpacity
                              key={val}
                              onPress={() => {
                              store.setLanguageReadLength(lang.code, val);
                              analytics.trackBriefLengthChanged(lang.code, val);
                            }}
                              style={{
                                paddingHorizontal: 10,
                                paddingVertical: 4,
                                borderRadius: 12,
                                borderWidth: 1,
                                borderColor: active ? colors.inkDark : colors.borderMid,
                                backgroundColor: active ? colors.inkDark : 'transparent',
                              }}
                            >
                              <Text style={{ fontSize: 12, color: active ? colors.surface : colors.inkLight, fontFamily: fontFamily.regular }}>
                                {label}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    </View>
                  </>
                )}
              </View>
            )}
          />

        </ScrollView>

        {/* ── Page 1: Genres ── */}
        <ScrollView
          style={[styles.pageScroll, { backgroundColor: colors.bg }]}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          scrollEnabled={!isDragging}
          directionalLockEnabled
          showsVerticalScrollIndicator={false}
        >
          <SectionHeader title="Genres" colors={colors} fontFamily={fontFamily} />

          <DraggableList
            items={topicItems}
            keyExtractor={(item) => item.key}
            itemHeight={56}
            onReorder={store.reorderTopics}
            onDragStateChange={setIsDragging}
            renderItem={(item) => (
              <View style={[styles.row, { borderBottomColor: colors.borderLight }]}>
                <Ionicons name="reorder-three-outline" size={20} color={colors.inkFaint} style={{ marginRight: 4 }} />
                <Text style={[styles.rowLabel, { color: item.comingSoon ? colors.inkFaint : colors.inkDark, fontFamily: fontFamily.regular, fontSize: fontSize.body }]}>
                  {item.label}
                </Text>
                {item.comingSoon ? (
                  <View style={[styles.comingSoonBadge, { borderColor: colors.borderMid }]}>
                    <Text style={[styles.comingSoonText, { color: colors.inkFaint, fontFamily: fontFamily.regular }]}>
                      Coming Soon
                    </Text>
                  </View>
                ) : (
                  <Switch
                    value={store.topics[item.key]}
                    onValueChange={() => store.toggleTopic(item.key)}
                    trackColor={{ false: isDark ? 'rgba(255,255,255,0.20)' : colors.borderMid, true: colors.chrome }}
                    thumbColor="#FFF"
                  />
                )}
              </View>
            )}
          />
        </ScrollView>

        {/* ── Page 2: Display ── */}
        <ScrollView
          style={[styles.pageScroll, { backgroundColor: colors.bg }]}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          directionalLockEnabled
          showsVerticalScrollIndicator={false}
        >
          <SectionHeader title="Display" colors={colors} fontFamily={fontFamily} />

          <DisplayPreview colors={colors} fontFamily={fontFamily} fontSize={fontSize} />

          <Text style={[styles.fieldLabel, { color: colors.inkLight, fontFamily: fontFamily.regular }]}>Background</Text>
          <View style={[styles.bgContainer, { borderColor: colors.borderMid }]}>
            {BACKGROUNDS.map((bg, i) => {
              const selected = store.background === bg.key;
              return (
                <TouchableOpacity
                  key={bg.key}
                  style={[
                    styles.bgSegment,
                    { backgroundColor: bg.color },
                    i > 0 && { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: colors.borderMid },
                  ]}
                  onPress={() => store.setBackground(bg.key)}
                >
                  <Text style={[styles.bgSegmentLabel, { color: bg.ink, fontFamily: selected ? fontFamily.bold : fontFamily.regular }]}>
                    {bg.label}
                  </Text>
                  {selected && (
                    <View
                      pointerEvents="none"
                      style={[StyleSheet.absoluteFillObject, { borderWidth: 1.5, borderColor: bg.ink }]}
                    />
                  )}
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={[styles.fieldLabel, { color: colors.inkLight, fontFamily: fontFamily.regular }]}>Font</Text>
          {(['lora', 'garamond', 'playfair', 'times'] as FontFamilyKey[]).map((key) => {
            const fam = FontFamilies[key];
            const selected = store.fontFamily === key;
            return (
              <TouchableOpacity
                key={key}
                style={[styles.fontRow, { borderBottomColor: colors.borderLight }]}
                onPress={() => store.setFontFamily(key)}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[styles.fontSample, { fontFamily: fam.regular, color: colors.inkDark }]}>
                    {fam.label}
                  </Text>
                  <Text style={[styles.fontPreview, { fontFamily: fam.italic, color: colors.inkLight }]}>
                    The quick brown fox
                  </Text>
                </View>
                {selected && <Ionicons name="checkmark-circle" size={22} color={colors.inkDark} />}
              </TouchableOpacity>
            );
          })}

          <Text style={[styles.fieldLabel, { color: colors.inkLight, fontFamily: fontFamily.regular }]}>Text Size</Text>
          <SegmentedControl
            options={[
              { label: 'A', value: 'small',      optionFontSize: 11 },
              { label: 'A', value: 'medium',     optionFontSize: 14 },
              { label: 'A', value: 'large',      optionFontSize: 17 },
              { label: 'A', value: 'extraLarge', optionFontSize: 20 },
            ]}
            value={store.fontSize}
            onChange={(v) => store.setFontSize(v as FontSizeKey)}
            colors={colors}
            fontFamily={fontFamily}
          />

          <View style={[styles.row, { borderBottomColor: colors.borderLight }]}>
            <Text style={[styles.rowLabel, { color: colors.inkDark, fontFamily: fontFamily.regular, fontSize: fontSize.body }]}>Auto Night Mode</Text>
            <Switch
              value={store.autoNightMode}
              onValueChange={store.setAutoNightMode}
              trackColor={{ false: colors.borderMid, true: colors.inkDark }}
              thumbColor={colors.bg}
            />
          </View>
          {store.autoNightMode && (
            <Text style={[styles.helper, { color: colors.inkFaint, fontFamily: fontFamily.regular }]}>
              Switches to Night theme when your iPhone enters dark mode. Set iPhone to Automatic in Settings → Display & Brightness.
            </Text>
          )}

          <Text style={[styles.fieldLabel, { color: colors.inkLight, fontFamily: fontFamily.regular }]}>App Icon</Text>
          <View style={styles.iconRow}>
            {APP_ICONS.map((icon) => {
              const active = store.appIcon === icon.name;
              return (
                <TouchableOpacity
                  key={icon.name ?? 'default'}
                  style={styles.iconTile}
                  onPress={() => {
                    store.setAppIcon(icon.name);
                    applyNativeIcon(store.appIconAuto ? getAutoIcon(icon.name, isDark) : icon.name);
                  }}
                  activeOpacity={0.8}
                >
                  <View style={[styles.iconShadow, active && { shadowOpacity: 0.32, elevation: 8 }]}>
                    <View style={styles.iconFrame}>
                      <Image source={icon.image} style={styles.iconThumb} />
                    </View>
                    <View style={[styles.iconRim, { borderColor: active ? colors.inkDark : 'rgba(255,255,255,0.42)' }]} pointerEvents="none" />
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
          <View style={[styles.row, { borderBottomColor: colors.borderLight }]}>
            <Text style={[styles.rowLabel, { color: colors.inkDark, fontFamily: fontFamily.regular, fontSize: fontSize.body }]}>Auto Day / Night Icon</Text>
            <Switch
              value={store.appIconAuto}
              onValueChange={store.setAppIconAuto}
              trackColor={{ false: colors.borderMid, true: colors.inkDark }}
              thumbColor={colors.bg}
            />
          </View>
          {store.appIconAuto && (
            <Text style={[styles.helper, { color: colors.inkFaint, fontFamily: fontFamily.regular }]}>
              Icon switches automatically with your iPhone's light/dark mode. Pairs: White ↔ Black · Cream ↔ Navy · Pride ↔ Pride 2.
            </Text>
          )}
          <Text style={[styles.helper, { color: colors.inkFaint, fontFamily: fontFamily.regular }]}>
            Requires an installed build. iOS briefly confirms when the icon changes.
          </Text>

        </ScrollView>

        {/* ── Page 3: Profile ── */}
        <ScrollView
          style={[styles.pageScroll, { backgroundColor: colors.bg }]}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          directionalLockEnabled
          showsVerticalScrollIndicator={false}
        >
          {/* Profile Avatar */}
          <View style={profileStyles.avatarSection}>
            <View style={[profileStyles.avatar, { backgroundColor: colors.chrome }]}>
              <Text style={[profileStyles.avatarInitials, { fontFamily: fontFamily.bold, color: colors.bg }]}>
                {displayName ? displayName.charAt(0).toUpperCase() : 'G'}
              </Text>
            </View>
            {displayName ? (
              <Text style={[profileStyles.displayName, { color: colors.inkDark, fontFamily: fontFamily.bold }]}>
                {displayName}
              </Text>
            ) : (
              <Text style={[profileStyles.displayName, { color: colors.inkDark, fontFamily: fontFamily.bold }]}>
                Guest
              </Text>
            )}
            <TouchableOpacity
              onPress={() => {
                if (isSignedIn) {
                  setUsernameInput(username);
                  setUsernameModalVisible(true);
                }
              }}
              disabled={!isSignedIn}
            >
              <Text style={[profileStyles.usernameLabel, { color: colors.inkFaint, fontFamily: fontFamily.regular }]}>
                {username ? `@${username}` : isSignedIn ? 'Tap to set username' : '@guest'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Account Settings button */}
          <TouchableOpacity
            style={[profileStyles.settingsButton, { backgroundColor: colors.surface, borderColor: colors.borderMid }]}
            onPress={() => setSettingsSheetVisible(true)}
          >
            <Text style={[profileStyles.settingsButtonText, { color: colors.inkDark, fontFamily: fontFamily.regular, fontSize: fontSize.body }]}>
              Account Settings
            </Text>
            <Ionicons name="chevron-forward" size={16} color={colors.inkFaint} />
          </TouchableOpacity>

          {/* Divider */}
          <View style={[profileStyles.divider, { backgroundColor: colors.borderLight }]} />

          {/* Daily Streaks section */}
          <View style={profileStyles.streakHeader}>
            <View style={profileStyles.streakLeft}>
              <Text style={[profileStyles.streakCount, { color: colors.inkDark, fontFamily: fontFamily.bold }]}>
                {maxStreak}
              </Text>
              <Text style={[profileStyles.streakDayLabel, { color: colors.inkFaint, fontFamily: fontFamily.regular }]}>
                {maxStreak === 1 ? 'day' : 'days'}
              </Text>
            </View>
            <Text style={[profileStyles.streakTitle, { color: colors.inkDark, fontFamily: fontFamily.bold }]}>
              Daily Streaks
            </Text>
            <TouchableOpacity style={profileStyles.streakRight} onPress={() => { setFilterLang('all'); setViewAllVisible(true); }}>
              <Text style={[profileStyles.viewAllText, { color: colors.chrome, fontFamily: fontFamily.regular }]}>
                View All →
              </Text>
            </TouchableOpacity>
          </View>

          <StreakCalendar readingHistory={readingHistory} />
        </ScrollView>
      </ScrollView>

      {/* ── Settings bottom sheet ── */}
      <Modal
        visible={settingsSheetVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setSettingsSheetVisible(false)}
      >
        <View style={modalStyles.overlay}>
          <View style={[modalStyles.sheet, { backgroundColor: colors.surface }]}>
            {/* Drag handle + title + close */}
            <View style={sheetStyles.handleRow}>
              <View style={[sheetStyles.handle, { backgroundColor: colors.borderMid }]} />
            </View>
            <View style={sheetStyles.titleRow}>
              <TouchableOpacity onPress={() => setSettingsSheetVisible(false)}>
                <Ionicons name="chevron-back" size={24} color={colors.inkDark} />
              </TouchableOpacity>
              <Text style={[sheetStyles.sheetTitle, { color: colors.inkDark, fontFamily: fontFamily.bold }]}>
                Settings
              </Text>
              <View style={{ width: 24 }} />
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {/* Account */}
              <SectionHeader title="Account" colors={colors} fontFamily={fontFamily} />
              {isSignedIn ? (
                <>
                  <View style={[styles.row, { borderBottomColor: colors.borderLight }]}>
                    <View style={{ flex: 1 }}>
                      {displayName ? (
                        <Text style={[styles.rowLabel, { color: colors.inkDark, fontFamily: fontFamily.bold, fontSize: fontSize.body }]}>
                          {displayName}
                        </Text>
                      ) : null}
                      {userEmail ? (
                        <Text style={[styles.rowSub, { color: colors.inkFaint }]}>{userEmail}</Text>
                      ) : null}
                    </View>
                  </View>
                  <TouchableOpacity
                    style={[styles.row, { borderBottomColor: colors.borderLight }]}
                    onPress={() => {
                      Alert.alert('Sign out', 'Are you sure you want to sign out?', [
                        { text: 'Cancel', style: 'cancel' },
                        { text: 'Sign out', style: 'destructive', onPress: () => signOut() },
                      ]);
                    }}
                  >
                    <Text style={[styles.rowLabel, { color: '#E53935', fontFamily: fontFamily.regular, fontSize: fontSize.body }]}>
                      Sign out
                    </Text>
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  <Text style={[styles.helper, { color: colors.inkFaint, fontFamily: fontFamily.regular, marginHorizontal: 16, marginTop: 4 }]}>
                    Sign in to sync your streaks and word bank across devices.
                  </Text>
                  {appleAvailable && (
                    <View style={{ paddingHorizontal: Spacing.lg, paddingBottom: Spacing.sm }}>
                      <AppleAuthentication.AppleAuthenticationButton
                        buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
                        buttonStyle={isDark
                          ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
                          : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
                        cornerRadius={8}
                        style={{ height: 44 }}
                        onPress={handleAppleSignIn}
                      />
                    </View>
                  )}
                  <TouchableOpacity
                    style={[sheetStyles.googleButton, { borderColor: colors.borderMid, backgroundColor: colors.bg }]}
                    onPress={handleGoogleSignIn}
                  >
                    <Text style={[sheetStyles.googleButtonText, { color: colors.inkDark, fontFamily: fontFamily.regular }]}>
                      Continue with Google
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.row, { borderBottomColor: colors.borderLight }]}
                    onPress={() => {
                      setSettingsSheetVisible(false);
                      setAuthError(null);
                      setAuthEmail('');
                      setAuthPassword('');
                      setSignInModalVisible(true);
                    }}
                  >
                    <Text style={[styles.rowLabel, { color: colors.inkDark, fontFamily: fontFamily.regular, fontSize: fontSize.body }]}>
                      Sign in / Create account
                    </Text>
                    <Ionicons name="chevron-forward" size={16} color={colors.inkFaint} />
                  </TouchableOpacity>
                </>
              )}

              {/* Notifications */}
              <SectionHeader title="Notifications" colors={colors} fontFamily={fontFamily} />
              <View style={[styles.row, { borderBottomColor: colors.borderLight }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.rowLabel, { color: colors.inkDark, fontFamily: fontFamily.regular, fontSize: fontSize.body }]}>
                    Daily Briefing Time
                  </Text>
                  <Text style={[styles.rowSub, { color: colors.inkFaint }]}>When you'd like to be notified</Text>
                </View>
                <TimeInput
                  value={store.briefingNotificationTime}
                  onChange={store.setBriefingNotificationTime}
                  onCommit={() => {
                    const topLanguage = store.activeLanguages()[0]?.code ?? 'en';
                    scheduleBriefingNotification(store.briefingNotificationTime, topLanguage as any);
                  }}
                  colors={colors}
                  fontFamily={fontFamily}
                />
              </View>
              <View style={[styles.row, { borderBottomColor: colors.borderLight }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.rowLabel, { color: colors.inkDark, fontFamily: fontFamily.regular, fontSize: fontSize.body }]}>
                    Daily Practice Reminder
                  </Text>
                  <Text style={[styles.rowSub, { color: colors.inkFaint }]}>When to practise your word bank</Text>
                </View>
                <TimeInput
                  value={store.practiceNotificationTime}
                  onChange={store.setPracticeNotificationTime}
                  onCommit={() => schedulePracticeNotification(store.practiceNotificationTime)}
                  colors={colors}
                  fontFamily={fontFamily}
                />
              </View>

              {/* Premium */}
              <SectionHeader title="Premium" colors={colors} fontFamily={fontFamily} />
              <View style={[styles.row, { borderBottomColor: colors.borderLight }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.rowLabel, { color: colors.inkDark, fontFamily: fontFamily.regular, fontSize: fontSize.body }]}>
                    Bilinguist Premium
                  </Text>
                  <Text style={[styles.rowSub, { color: colors.inkFaint }]}>Unlock all languages and unlimited word saves</Text>
                </View>
                <View style={[styles.comingSoonBadge, { borderColor: colors.borderMid }]}>
                  <Text style={[styles.comingSoonText, { color: colors.inkFaint, fontFamily: fontFamily.regular }]}>
                    Coming soon
                  </Text>
                </View>
              </View>

              {/* About */}
              <SectionHeader title="About" colors={colors} fontFamily={fontFamily} />
              <View style={[styles.row, { borderBottomColor: colors.borderLight }]}>
                <Text style={[styles.rowLabel, { color: colors.inkDark, fontFamily: fontFamily.regular, fontSize: fontSize.body }]}>
                  Bilinguist Brief
                </Text>
                <Text style={[styles.rowSub, { color: colors.inkFaint, fontFamily: fontFamily.regular }]}>
                  Version 1.0
                </Text>
              </View>
              {/* Developer */}
              <View style={styles.devSection}>
                <TouchableOpacity onPress={() => { setSettingsSheetVisible(false); handleDevTap(); }} style={styles.devTap}>
                  <Text style={[styles.devText, { color: colors.inkFaint }]}>
                    {store.developerMode ? 'Developer mode: ON — tap to disable' : '·  ·  ·'}
                  </Text>
                </TouchableOpacity>
                {store.developerMode && (
                  <View style={{ alignItems: 'center', gap: 6, marginTop: 4 }}>
                    <Text style={[styles.devText, { color: colors.inkFaint }]}>
                      {usageLabel} · Access: {status}
                    </Text>
                    <TouchableOpacity
                      onPress={() => resetDailyUsage().then(() => setUsageLabel('0/20 briefings today')).catch(() => {})}
                      style={[styles.devTap, { borderWidth: StyleSheet.hairlineWidth, borderColor: colors.borderMid, borderRadius: 6, paddingHorizontal: 16 }]}
                    >
                      <Text style={[styles.devText, { color: colors.inkLight }]}>Reset usage counter</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => {
                        const result = applyPromoCode('FOUNDER');
                        Alert.alert(result === 'success' ? 'Full access enabled' : result === 'already_active' ? 'Already active' : 'Invalid code');
                      }}
                      style={[styles.devTap, { borderWidth: StyleSheet.hairlineWidth, borderColor: colors.borderMid, borderRadius: 6, paddingHorizontal: 16 }]}
                    >
                      <Text style={[styles.devText, { color: colors.inkLight }]}>Enable full access (promo)</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      disabled={isForceRegenerating}
                      onPress={async () => {
                        const active = store.languages.filter((l) => l.active);
                        if (active.length === 0) { Alert.alert('No active languages', 'Enable at least one language in settings.'); return; }
                        setIsForceRegenerating(true);
                        try {
                          const calls: Array<() => Promise<void>> = [];
                          for (const lang of active) {
                            const level = lang.level ?? 'B1';
                            const length = (lang.readLength ?? 'medium') as ArticleLength;
                            calls.push(() => loadBriefing(lang.code, level, length, true));
                          }
                          await Promise.all(calls.map((fn) => fn()));
                          Alert.alert('Done', `Regenerated ${active.length} language${active.length > 1 ? 's' : ''} (all length variants).`);
                        } catch {
                          Alert.alert('Error', 'One or more variants failed. Check the Brief screen for details.');
                        } finally {
                          setIsForceRegenerating(false);
                        }
                      }}
                      style={[styles.devTap, { borderWidth: StyleSheet.hairlineWidth, borderColor: colors.accentRed, borderRadius: 6, paddingHorizontal: 16, opacity: isForceRegenerating ? 0.5 : 1 }]}
                    >
                      <Text style={[styles.devText, { color: colors.accentRed }]}>
                        {isForceRegenerating ? 'Regenerating…' : 'Force regenerate everything now'}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={async () => {
                        try {
                          const fb = await getTodayFactbase();
                          if (!fb) { Alert.alert('No factbase', "Today's factbase hasn't been gathered yet."); return; }
                          const preview = JSON.stringify(fb, null, 2).slice(0, 1200);
                          Alert.alert(`Factbase (${fb.length} stories)`, preview + (preview.length >= 1200 ? '\n…(truncated)' : ''));
                        } catch {}
                      }}
                      style={[styles.devTap, { borderWidth: StyleSheet.hairlineWidth, borderColor: colors.borderMid, borderRadius: 6, paddingHorizontal: 16 }]}
                    >
                      <Text style={[styles.devText, { color: colors.inkLight }]}>View today's factbase</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ── View All (Reading History) modal ── */}
      <Modal
        visible={viewAllVisible}
        animationType="slide"
        onRequestClose={() => setViewAllVisible(false)}
      >
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top', 'bottom']}>
          {/* Header */}
          <View style={[sheetStyles.fullScreenHeader, { borderBottomColor: colors.borderLight }]}>
            <Text style={[sheetStyles.fullScreenTitle, { color: colors.inkDark, fontFamily: fontFamily.bold }]}>
              Reading History
            </Text>
            <TouchableOpacity onPress={() => setViewAllVisible(false)}>
              <Ionicons name="close" size={22} color={colors.inkDark} />
            </TouchableOpacity>
          </View>

          {/* Language filter chips */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={sheetStyles.chipScroll}
            contentContainerStyle={sheetStyles.chipContainer}
          >
            <TouchableOpacity
              style={[
                sheetStyles.chip,
                { borderColor: filterLang === 'all' ? colors.chrome : colors.borderMid,
                  backgroundColor: filterLang === 'all' ? colors.chrome : 'transparent' },
              ]}
              onPress={() => setFilterLang('all')}
            >
              <Text style={[sheetStyles.chipText, { color: filterLang === 'all' ? colors.bg : colors.inkDark, fontFamily: fontFamily.regular }]}>
                ALL
              </Text>
            </TouchableOpacity>
            {activeLanguages.map((lang) => (
              <TouchableOpacity
                key={lang.code}
                style={[
                  sheetStyles.chip,
                  { borderColor: filterLang === lang.code ? colors.chrome : colors.borderMid,
                    backgroundColor: filterLang === lang.code ? colors.chrome : 'transparent' },
                ]}
                onPress={() => setFilterLang(lang.code)}
              >
                <Text style={[sheetStyles.chipText, { color: filterLang === lang.code ? colors.bg : colors.inkDark, fontFamily: fontFamily.regular }]}>
                  {lang.flag} {lang.nativeName}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Full calendar */}
          <FullStreakCalendar readingHistory={readingHistory} filterLang={filterLang} />
        </SafeAreaView>
      </Modal>

      {/* ── Username edit modal ── */}
      <Modal
        visible={usernameModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setUsernameModalVisible(false)}
      >
        <View style={modalStyles.overlay}>
          <View style={[modalStyles.codeSheet, { backgroundColor: colors.surface }]}>
            <Text style={[modalStyles.title, { color: colors.inkDark, fontFamily: fontFamily.bold }]}>
              Set Username
            </Text>
            <TextInput
              style={[
                modalStyles.codeInput,
                { color: colors.inkDark, borderColor: colors.borderMid, fontFamily: fontFamily.regular, backgroundColor: colors.bg, letterSpacing: 0, fontSize: 16 },
              ]}
              value={usernameInput}
              onChangeText={setUsernameInput}
              placeholder="username"
              placeholderTextColor={colors.inkFaint}
              autoCapitalize="none"
              autoCorrect={false}
              autoFocus
            />
            <TouchableOpacity
              style={[modalStyles.codeButton, { backgroundColor: colors.chrome }]}
              onPress={() => {
                setUsername(usernameInput.trim());
                setUsernameModalVisible(false);
              }}
            >
              <Text style={modalStyles.codeButtonText}>Save</Text>
            </TouchableOpacity>
            <TouchableOpacity style={modalStyles.cancel} onPress={() => setUsernameModalVisible(false)}>
              <Text style={[modalStyles.cancelText, { color: colors.inkLight, fontFamily: fontFamily.regular }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Level picker modal */}
      <Modal
        visible={!!levelModalLang}
        transparent
        animationType="slide"
        onRequestClose={() => setLevelModalLang(null)}
      >
        <View style={modalStyles.overlay}>
          <View style={[modalStyles.sheet, { backgroundColor: colors.surface }]}>
            <Text style={[modalStyles.title, { color: colors.inkDark, fontFamily: fontFamily.bold }]}>
              {levelModal?.name} — Level
            </Text>
            {orderedLevels(levelModalLang ?? '', levelModal?.code ? availableLevelsByLang[levelModal.code] : undefined).map((level) => {
              const langCode = levelModal?.code ?? 'en';
              const grade = nativeGradeByLang[langCode];
              const mainLabel = level === 'Native' ? nativeLabel(langCode, grade) : level;
              return (
                <TouchableOpacity
                  key={level}
                  style={[modalStyles.option, { borderBottomColor: colors.borderLight }]}
                  onPress={() => {
                    if (levelModalLang) {
                      const oldLevel = store.languages.find(l => l.code === levelModalLang)?.level ?? '';
                      store.setLanguageLevel(levelModalLang as any, level);
                      analytics.trackLevelChanged(levelModalLang, level, oldLevel);
                    }
                    setLevelModalLang(null);
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[modalStyles.optionText, { color: colors.inkDark, fontFamily: fontFamily.regular }]}>
                      {mainLabel}
                    </Text>
                  </View>
                  {levelModal?.level === level && (
                    <Ionicons name="checkmark" size={20} color={colors.inkDark} />
                  )}
                </TouchableOpacity>
              );
            })}
            <TouchableOpacity style={modalStyles.cancel} onPress={() => setLevelModalLang(null)}>
              <Text style={[modalStyles.cancelText, { color: colors.inkLight, fontFamily: fontFamily.regular }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Sign-in modal */}
      <Modal
        visible={signInModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setSignInModalVisible(false)}
      >
        <View style={modalStyles.overlay}>
          <View style={[modalStyles.sheet, { backgroundColor: colors.surface }]}>
            <Text style={[modalStyles.title, { color: colors.inkDark, fontFamily: fontFamily.bold }]}>
              {authMode === 'signin' ? 'Sign in' : 'Create account'}
            </Text>

            {appleAvailable && (
              <View style={{ paddingHorizontal: Spacing.lg, paddingBottom: Spacing.md }}>
                <AppleAuthentication.AppleAuthenticationButton
                  buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
                  buttonStyle={isDark
                    ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
                    : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
                  cornerRadius={22}
                  style={{ height: 44 }}
                  onPress={handleAppleSignIn}
                />
              </View>
            )}

            {appleAvailable && (
              <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.lg, marginBottom: Spacing.md }}>
                <View style={{ flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.borderMid }} />
                <Text style={{ color: colors.inkFaint, fontFamily: fontFamily.regular, fontSize: 12, marginHorizontal: 10 }}>or</Text>
                <View style={{ flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.borderMid }} />
              </View>
            )}

            <View style={{ paddingHorizontal: Spacing.lg, gap: Spacing.sm }}>
              <TextInput
                style={[modalStyles.codeInput, { color: colors.inkDark, borderColor: colors.borderMid, fontFamily: fontFamily.regular, backgroundColor: colors.bg, letterSpacing: 0, fontSize: 15 }]}
                value={authEmail}
                onChangeText={setAuthEmail}
                placeholder="Email"
                placeholderTextColor={colors.inkFaint}
                autoCapitalize="none"
                keyboardType="email-address"
                autoComplete="email"
              />
              <TextInput
                style={[modalStyles.codeInput, { color: colors.inkDark, borderColor: colors.borderMid, fontFamily: fontFamily.regular, backgroundColor: colors.bg, letterSpacing: 0, fontSize: 15 }]}
                value={authPassword}
                onChangeText={setAuthPassword}
                placeholder="Password"
                placeholderTextColor={colors.inkFaint}
                secureTextEntry
                autoComplete={authMode === 'signup' ? 'new-password' : 'password'}
                onSubmitEditing={handleEmailAuth}
              />
            </View>

            {authError ? (
              <Text style={{ color: '#E53935', fontFamily: fontFamily.regular, fontSize: 13, paddingHorizontal: Spacing.lg, marginTop: 4, marginBottom: -4 }}>
                {authError}
              </Text>
            ) : null}

            <TouchableOpacity
              style={[modalStyles.codeButton, { backgroundColor: colors.accentGold, marginHorizontal: Spacing.lg, marginTop: Spacing.md, opacity: authLoading ? 0.6 : 1 }]}
              onPress={handleEmailAuth}
              disabled={authLoading}
            >
              <Text style={modalStyles.codeButtonText}>{authLoading ? 'Please wait…' : authMode === 'signin' ? 'Sign in' : 'Create account'}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[modalStyles.cancel]}
              onPress={() => setAuthMode(authMode === 'signin' ? 'signup' : 'signin')}
            >
              <Text style={[modalStyles.cancelText, { color: colors.inkLight, fontFamily: fontFamily.regular }]}>
                {authMode === 'signin' ? "Don't have an account? Create one" : 'Already have an account? Sign in'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity style={modalStyles.cancel} onPress={() => setSignInModalVisible(false)}>
              <Text style={[modalStyles.cancelText, { color: colors.inkFaint, fontFamily: fontFamily.regular }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Dev code modal */}
      <Modal
        visible={devModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setDevModalVisible(false)}
      >
        <View style={modalStyles.overlay}>
          <View style={[modalStyles.codeSheet, { backgroundColor: colors.surface }]}>
            <Text style={[modalStyles.title, { color: colors.inkDark, fontFamily: fontFamily.bold }]}>
              Developer Access
            </Text>
            <TextInput
              style={[
                modalStyles.codeInput,
                { color: colors.inkDark, borderColor: colors.borderMid, fontFamily: fontFamily.regular, backgroundColor: colors.bg },
              ]}
              value={devCodeInput}
              onChangeText={setDevCodeInput}
              placeholder="Enter code"
              placeholderTextColor={colors.inkFaint}
              autoCapitalize="characters"
              autoFocus
              onSubmitEditing={handleDevCodeSubmit}
            />
            <TouchableOpacity
              style={[modalStyles.codeButton, { backgroundColor: colors.accentGold }]}
              onPress={handleDevCodeSubmit}
            >
              <Text style={modalStyles.codeButtonText}>Unlock</Text>
            </TouchableOpacity>
            <TouchableOpacity style={modalStyles.cancel} onPress={() => setDevModalVisible(false)}>
              <Text style={[modalStyles.cancelText, { color: colors.inkLight, fontFamily: fontFamily.regular }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ── Styles ──

const styles = StyleSheet.create({
  pageScroll: { width: SCREEN_WIDTH },
  content: { paddingBottom: FLOAT_TAB_INSET },
  helper: { fontSize: 13, marginHorizontal: Spacing.md, marginTop: Spacing.xs, marginBottom: Spacing.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: Spacing.sm,
  },
  rowLabel: { flex: 1 },
  rowSub: { fontSize: 12, marginTop: 2 },
  comingSoonBadge: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  comingSoonText: { fontSize: 11, letterSpacing: 0.3, opacity: 0.7 },
  levelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md + 32 + Spacing.sm,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: Spacing.sm,
  },
  levelLabel: { flex: 1, fontSize: 13 },
  levelValue: { fontSize: 14 },
  fieldLabel: {
    fontSize: 12,
    letterSpacing: 0.5,
    marginHorizontal: Spacing.md,
    marginTop: Spacing.md,
    marginBottom: Spacing.sm,
    textTransform: 'uppercase',
  },
  bgContainer: {
    flexDirection: 'row',
    marginHorizontal: Spacing.md,
    borderWidth: 1,
    borderRadius: 8,
    overflow: 'hidden',
    marginBottom: Spacing.sm,
  },
  bgSegment: {
    flex: 1,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bgSegmentLabel: { fontSize: 13 },
  fontRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  fontSample: { fontSize: 15 },
  fontPreview: { fontSize: 12, marginTop: 1 },
  iconRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
    marginHorizontal: Spacing.md,
  },
  iconTile: {
    width: (SCREEN_WIDTH - Spacing.md * 2 - Spacing.sm * 2) / 3,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconShadow: {
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
    elevation: 5,
  },
  iconFrame: {
    width: 80,
    height: 80,
    borderRadius: 20,
    overflow: 'hidden',
  },
  iconRim: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    borderRadius: 20,
    borderWidth: 2,
  },
  iconThumb: {
    width: 80,
    height: 80,
  },
  devSection: { marginTop: Spacing.xxl, alignItems: 'center', paddingBottom: Spacing.md },
  devTap: { padding: Spacing.md },
  devText: { fontSize: 13 },
});

const sectionStyles = StyleSheet.create({
  header: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.xl,
    paddingBottom: Spacing.sm,
    borderBottomWidth: 2,
    marginBottom: Spacing.xs,
  },
  title: { fontSize: 18, letterSpacing: 0.3 },
});

const segStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    marginHorizontal: Spacing.md,
    borderWidth: 1,
    borderRadius: 8,
    overflow: 'hidden',
    marginBottom: Spacing.xs,
  },
  option: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
  },
  label: { fontSize: 13 },
});

const timeStyles = StyleSheet.create({
  input: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Platform.OS === 'ios' ? 8 : 6,
    fontSize: 15,
    width: 72,
    textAlign: 'center',
  },
});

const previewStyles = StyleSheet.create({
  container: {
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderRadius: 8,
  },
  label: {
    fontSize: 10,
    letterSpacing: 1.5,
    marginBottom: Spacing.sm,
  },
  headline: {
    lineHeight: 28,
    marginBottom: Spacing.xs,
  },
  body: {
    lineHeight: 22,
  },
});

const modalStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingBottom: 34,
    maxHeight: SCREEN_HEIGHT * 0.68,
  },
  codeSheet: {
    margin: 32,
    borderRadius: 16,
    padding: Spacing.lg,
  },
  title: {
    fontSize: 18,
    padding: Spacing.lg,
    paddingBottom: Spacing.sm,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: 15,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  optionText: { fontSize: 16 },
  optionSublabel: { fontSize: 11, marginTop: 1 },
  cancel: {
    paddingVertical: Spacing.md,
    alignItems: 'center',
    marginTop: Spacing.sm,
  },
  cancelText: { fontSize: 15 },
  codeInput: {
    borderWidth: 1,
    borderRadius: 100,
    paddingVertical: 13,
    paddingHorizontal: 20,
    fontSize: 18,
    textAlign: 'center',
    letterSpacing: 3,
    marginBottom: Spacing.md,
  },
  codeButton: {
    borderRadius: 100,
    padding: Spacing.md,
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  codeButtonText: { color: '#FFF', fontSize: 16, fontWeight: '600' },
});

const profileStyles = StyleSheet.create({
  avatarSection: {
    alignItems: 'center',
    paddingTop: Spacing.xl,
    paddingBottom: Spacing.lg,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.sm,
  },
  avatarInitials: {
    fontSize: 32,
  },
  displayName: {
    fontSize: 18,
    marginBottom: Spacing.xs,
  },
  usernameLabel: {
    fontSize: 13,
  },
  settingsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: 14,
    borderRadius: 100,
    borderWidth: StyleSheet.hairlineWidth,
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  settingsButtonText: {
    flex: 1,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.md,
  },
  streakHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  streakLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  streakCount: {
    fontSize: 18,
  },
  streakDayLabel: {
    fontSize: 12,
    marginTop: 2,
  },
  streakTitle: {
    fontSize: 20,
    textAlign: 'center',
  },
  streakRight: {
    flex: 1,
    alignItems: 'flex-end',
  },
  viewAllText: {
    fontSize: 14,
  },
});

const sheetStyles = StyleSheet.create({
  handleRow: {
    alignItems: 'center',
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.xs,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.sm,
  },
  sheetTitle: {
    fontSize: 18,
  },
  googleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
    paddingVertical: 12,
    borderRadius: 100,
    borderWidth: 1,
  },
  googleButtonText: {
    fontSize: 15,
  },
  fullScreenHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  fullScreenTitle: {
    fontSize: 18,
  },
  chipScroll: {
    flexGrow: 0,
  },
  chipContainer: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    gap: Spacing.sm,
    flexDirection: 'row',
  },
  chip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: 16,
    borderWidth: 1,
  },
  chipText: {
    fontSize: 13,
  },
});
