import React, { useState, useCallback, useEffect, useRef } from 'react';
import { FlagCircle, GlobeCircle } from '../components/FlagCircle';
import { useScrollTabBar } from '../hooks/useScrollTabBar';


// Length picker labels localised to each target language
const LENGTH_LABELS: Record<string, readonly [string, string]> = {
  fr: ['Concis',  'Long'],
  de: ['Kurz',    'Lang'],
  sv: ['Kort',    'Lång'],
  en: ['Concise', 'Long'],
  it: ['Conciso', 'Lungo'],
  es: ['Conciso', 'Extenso'],
  tr: ['Kısa',    'Uzun'],
  hu: ['Rövid',   'Hosszú'],
  ar: ['موجز',    'طويل'],
};
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
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
  Animated,
  Easing,
  LayoutAnimation,
  KeyboardAvoidingView,
  PanResponder,
} from 'react-native';

import { Ionicons } from '@expo/vector-icons';
import { DraggableList } from '../components/DraggableList';
import { useSettingsStore, LanguageLevel, langDisplayCode, type ReadLength } from '../store/useSettingsStore';
import { useBriefingStore } from '../store/useBriefingStore';
import type { ArticleLength } from '../services/anthropic';
import { NATIVE_WRITING_LEVEL } from '../services/prompts';
import { useSubscriptionStore } from '../store/useSubscriptionStore';
import { useNavPillStore, type SettingsSection } from '../store/useNavPillStore';
import { useTheme } from '../hooks/useTheme';
import { scheduleAllNotifications, scheduleStreakReminder, schedulePracticeNotification, PIPELINE_READY_TIME } from '../services/notifications';
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
// expo-alternate-app-icons is not available in Expo Go — lazy require so it fails
// gracefully rather than crashing the whole module on load.
let setNativeAppIcon: (icon: string | null) => Promise<void> = async () => {};
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  setNativeAppIcon = require('expo-alternate-app-icons').setAlternateAppIcon;
} catch { /* not available in Expo Go */ }
import Constants from 'expo-constants';
import * as analytics from '../services/analytics';
import { LegalDocModal, type LegalDoc } from './LegalDocModal';
import { AnalyticsScreen } from './analyticsDashboard/AnalyticsScreen';
import { isAdminEmail } from '../constants/admin';

const APP_VERSION = Constants.expoConfig?.version ?? '1.0';

const SCREEN_WIDTH = Dimensions.get('window').width;
const SCREEN_HEIGHT = Dimensions.get('window').height;

function applyNativeIcon(name: string | null) {
  setNativeAppIcon(name).catch(() => {});
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
  tr: 'Yerel', hu: 'Anyanyelvi',
};

// Build the "B2 / Native" style label using today's graded CEFR level.
// Falls back to NATIVE_WRITING_LEVEL (C1) if no grading data is available.
function nativeLabel(langCode: string, grade?: LanguageLevel): string {
  const g = grade ?? NATIVE_WRITING_LEVEL;
  return `${g} / ${NATIVE_WORD[langCode] ?? 'Native'}`;
}


const BACKGROUNDS: { key: BackgroundKey; label: string; color: string; ink: string }[] = [
  { key: 'white',    label: 'White', color: Colors.white,   ink: Colors.inkDark },
  { key: 'cream',    label: 'Cream', color: Colors.cream,   ink: Colors.navyBg  },
  { key: 'softGrey', label: 'Navy',  color: '#162032',      ink: Colors.cream   },
  { key: 'night',    label: 'Night', color: Colors.night,   ink: Colors.cream   },
];
const FONT_SIZES: FontSizeKey[] = ['small', 'medium', 'large', 'extraLarge'];
const GENRE_SETTINGS_DISCLAIMER: Record<string, string> = {
  worldNews:  'This genre may contain technical or international vocabulary beyond A1',
  ukPolitics: 'This genre may contain political vocabulary beyond A1',
  politics:   'This genre may contain political vocabulary beyond A1',
  business:   'This genre may contain financial and economic vocabulary beyond A1',
  europe:     'This genre may contain geopolitical vocabulary beyond A1',
  middleEast: 'This genre may contain geopolitical vocabulary beyond A1',
  africa:     'This genre may contain geopolitical vocabulary beyond A1',
  asia:       'This genre may contain geopolitical vocabulary beyond A1',
};

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
    <View style={sectionStyles.header}>
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
  containerStyle,
}: {
  options: { label: string; value: string; optionFontSize?: number }[];
  value: string;
  onChange: (v: string) => void;
  colors: any;
  fontFamily: any;
  containerStyle?: object;
}) {
  return (
    <View style={[segStyles.container, { borderColor: colors.borderMid, backgroundColor: colors.bg }, containerStyle]}>
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
      <Text style={[previewStyles.headline, { color: colors.inkDark, fontFamily: fontFamily.bold, fontSize: fontSize.heading * 0.75 }]}>
        La politique étrangère en débat
      </Text>
      <Text style={[previewStyles.body, { color: colors.inkMid, fontFamily: fontFamily.regular, fontSize: fontSize.body * 0.85 }]}>
        Les dirigeants mondiaux se sont réunis à Genève pour discuter des nouvelles mesures climatiques dans un contexte de tensions géopolitiques croissantes.
      </Text>
    </View>
  );
}

// --- Language card with animated expand ---

interface LangCardProps {
  lang: { code: string; nativeName: string; active: boolean; readLength?: string; level?: string };
  isAnyDragging: boolean;
  isDark: boolean;
  colors: any;
  fontFamily: any;
  fontSize: any;
  nativeGradeByLang: Record<string, any>;
  onToggle: () => void;
  onSetLength: (val: 'short' | 'longer') => void;
  onPressLevel: () => void;
  isDraggable?: boolean;
}

function LanguageCard({ lang, isAnyDragging, isDark, colors, fontFamily, fontSize, nativeGradeByLang, onToggle, onSetLength, onPressLevel, isDraggable = true }: LangCardProps) {
  const anim = useRef(new Animated.Value(lang.active ? 1 : 0)).current;
  const [expandedHeight, setExpandedHeight] = useState(0);

  useEffect(() => {
    Animated.timing(anim, {
      toValue: lang.active ? 1 : 0,
      duration: 240,
      easing: Easing.inOut(Easing.ease),
      useNativeDriver: false,
    }).start();
  }, [lang.active]);

  const langLabels = (LENGTH_LABELS[lang.code] ?? LENGTH_LABELS.en);

  // Derive opacity and shadow from the same animated value — no separate re-render flash
  const cardOpacity      = anim.interpolate({ inputRange: [0, 1], outputRange: [0.45, 1] });
  const cardShadowOp     = anim.interpolate({ inputRange: [0, 1], outputRange: [0.07, 0.12] });
  const cardElevation    = anim.interpolate({ inputRange: [0, 1], outputRange: [3, 5] });

  return (
    <Animated.View style={[lcStyles.card, {
      backgroundColor: colors.card,
      borderColor: colors.borderLight,
      opacity: cardOpacity,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: cardShadowOp,
      shadowRadius: 8,
      elevation: cardElevation,
    }]}>
      <View style={lcStyles.mainRow}>
        <Ionicons
          name="reorder-three-outline"
          size={20}
          color={colors.inkFaint}
          style={{ marginRight: 4, opacity: isDraggable ? 1 : 0 }}
        />
        <FlagCircle code={lang.code} size={28} />
        <Text style={[lcStyles.rowLabel, { color: colors.inkDark, fontFamily: fontFamily.regular, fontSize: fontSize.body }]}>
          {lang.nativeName}
        </Text>
        <Switch
          value={lang.active}
          onValueChange={onToggle}
          trackColor={{ false: isDark ? 'rgba(255,255,255,0.20)' : colors.borderMid, true: colors.chrome }}
          thumbColor="#FFF"
        />
      </View>

      {/* Animated expand section — always rendered so onLayout fires */}
      <Animated.View style={{
        height: expandedHeight > 0
          ? anim.interpolate({ inputRange: [0, 1], outputRange: [0, expandedHeight] })
          : undefined,
        overflow: 'hidden',
      }}>
        <View onLayout={e => {
          const h = e.nativeEvent.layout.height;
          if (h > 0) setExpandedHeight(prev => prev || h);
        }}>
          {/* Length */}
          <View style={[lcStyles.expandRow, { borderTopColor: colors.borderLight }]}>
            <Text style={[lcStyles.expandLabel, { color: colors.inkLight, fontFamily: fontFamily.regular }]}>Length</Text>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              {(['short', 'longer'] as const).map((val, i) => {
                const active = (lang.readLength ?? 'medium') === val;
                return (
                  <TouchableOpacity
                    key={val}
                    onPress={() => onSetLength(val)}
                    style={{
                      paddingHorizontal: 10,
                      paddingVertical: 4,
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: active
                        ? (isDark ? colors.inkFaint : colors.inkDark)
                        : colors.borderMid,
                      backgroundColor: active
                        ? (isDark ? colors.borderMid : colors.inkDark)
                        : 'transparent',
                    }}
                  >
                    <Text style={{ fontSize: 12, color: active ? colors.bg : colors.inkLight, fontFamily: fontFamily.regular }}>
                      {langLabels[i]}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
          {/* Level */}
          <TouchableOpacity style={[lcStyles.expandRow, { borderTopColor: colors.borderLight }]} onPress={onPressLevel}>
            <Text style={[lcStyles.expandLabel, { color: colors.inkLight, fontFamily: fontFamily.regular }]}>Level</Text>
            <Text style={{ fontSize: 14, color: colors.inkDark, fontFamily: fontFamily.bold }}>
              {lang.level === 'Native' ? nativeLabel(lang.code, nativeGradeByLang[lang.code]) : (lang.level ?? 'B1')}
            </Text>
            <Ionicons name="chevron-forward" size={16} color={colors.inkFaint} />
          </TouchableOpacity>
        </View>
      </Animated.View>
    </Animated.View>
  );
}

const lcStyles = StyleSheet.create({
  card: {
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.sm,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  mainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: 14,
    gap: Spacing.sm,
  },
  rowLabel: { flex: 1 },
  expandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: Spacing.sm,
  },
  expandLabel: { flex: 1, fontSize: 13 },
});

// --- Main screen ---

export function SettingsScreen() {
  const onScrollTabBar = useScrollTabBar();
  const { colors, fontFamily, fontSize, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const store = useSettingsStore();
  const { loadBriefing, nativeGradeByLang, availableLevelsByLang, availableLevelsByLangAndLength } = useBriefingStore();
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
  const sheetDragY = useRef(new Animated.Value(0)).current;
  const sheetPanResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gs) => gs.dy > 8 && Math.abs(gs.dy) > Math.abs(gs.dx),
      onPanResponderMove: (_, gs) => {
        if (gs.dy > 0) sheetDragY.setValue(gs.dy);
      },
      onPanResponderRelease: (_, gs) => {
        if (gs.dy > 80 || gs.vy > 0.5) {
          Animated.timing(sheetDragY, { toValue: 600, duration: 200, useNativeDriver: true }).start(() => {
            sheetDragY.setValue(0);
            setSettingsSheetVisible(false);
          });
        } else {
          Animated.spring(sheetDragY, { toValue: 0, useNativeDriver: true }).start();
        }
      },
    })
  ).current;
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
  const [supportModalVisible, setSupportModalVisible] = useState(false);
  const [supportSubject, setSupportSubject] = useState('');
  const [supportBody, setSupportBody] = useState('');
  const [supportLoading, setSupportLoading] = useState(false);
  const [supportState, setSupportState] = useState<'idle' | 'success' | 'error'>('idle');
  const [legalDocVisible, setLegalDocVisible] = useState(false);
  const [legalDocInitial, setLegalDocInitial] = useState<LegalDoc>('privacy');
  const [analyticsVisible, setAnalyticsVisible] = useState(false);

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
        options: {
          skipBrowserRedirect: true,
          redirectTo: 'bilinguistbrief://auth',
        },
      });
      if (data?.url) Linking.openURL(data.url);
      setSignInModalVisible(false);
    } catch (e: any) {
      setAuthError(e?.message ?? 'Google sign-in failed');
    } finally {
      setAuthLoading(false);
    }
  }

  function openLegalDoc(doc: LegalDoc) {
    setLegalDocInitial(doc);
    setSettingsSheetVisible(false);
    setLegalDocVisible(true);
  }

  function closeLegalDoc() {
    setLegalDocVisible(false);
    setSettingsSheetVisible(true);
  }

  function openSupportForm() {
    setSettingsSheetVisible(false);
    setSupportState('idle');
    setSupportSubject('');
    setSupportBody('');
    setSupportModalVisible(true);
  }

  function closeSupportModal() {
    setSupportModalVisible(false);
    setSupportState('idle');
  }

  async function handleSupportSubmit() {
    if (!supportSubject.trim() || !supportBody.trim()) return;
    setSupportLoading(true);
    try {
      const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
      const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
      const res = await fetch(`${supabaseUrl}/functions/v1/send-support-email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${anonKey}`,
        },
        body: JSON.stringify({
          subject: supportSubject.trim(),
          message: supportBody.trim(),
          email: userEmail ?? '',
          appVersion: APP_VERSION,
          platform: Platform.OS,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setSupportState('success');
    } catch {
      setSupportState('error');
    } finally {
      setSupportLoading(false);
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
          scrollEventThrottle={16}
          onScroll={onScrollTabBar}
        >
          <SectionHeader title="Language Preferences" colors={colors} fontFamily={fontFamily} />

          <Text style={[styles.helper, { color: colors.inkFaint, fontFamily: fontFamily.regular }]}>
            Toggle languages on to include them in your briefing.
          </Text>
          <Text style={[styles.helper, { color: colors.inkFaint, fontFamily: fontFamily.italic, marginTop: -4 }]}>
            Drag to reorder your languages in the brief.
          </Text>

          <DraggableList
            items={store.languages}
            keyExtractor={(lang) => lang.code}
            itemHeight={152}
            onReorder={store.reorderLanguages}
            onDragStateChange={setIsDragging}
            draggableCount={store.languages.filter((l) => l.active).length}
            renderItem={(lang, index, isAnyDragging) => (
              <LanguageCard
                lang={lang}
                isAnyDragging={isAnyDragging}
                isDark={isDark}
                colors={colors}
                fontFamily={fontFamily}
                fontSize={fontSize}
                nativeGradeByLang={nativeGradeByLang}
                isDraggable={lang.active}
                onToggle={() => {
                  const wasActive = lang.active;
                  store.toggleLanguage(lang.code);
                  if (wasActive) analytics.trackLanguageRemoved(lang.code);
                  else analytics.trackLanguageSelected(lang.code);
                  // Reschedule streak reminder so it reflects the new active-language set
                  const { lastReadDates } = useStreakStore.getState();
                  const activeLangs = useSettingsStore.getState().languages
                    .filter((l) => l.active)
                    .map((l) => ({ code: l.code, name: l.name }));
                  scheduleStreakReminder(activeLangs, lastReadDates).catch(() => {});
                }}
                onSetLength={(val) => {
                  store.setLanguageReadLength(lang.code, val);
                  analytics.trackBriefLengthChanged(lang.code, val);
                }}
                onPressLevel={() => setLevelModalLang(lang.code)}
              />
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
          scrollEventThrottle={16}
          onScroll={onScrollTabBar}
        >
          <SectionHeader title="Genres" colors={colors} fontFamily={fontFamily} />

          <Text style={[styles.helper, { color: colors.inkFaint, fontFamily: fontFamily.italic, marginTop: 4, marginBottom: 4 }]}>
            Drag to reorder genres in your brief.
          </Text>

          <DraggableList
            items={topicItems}
            keyExtractor={(item) => item.key}
            itemHeight={80}
            onReorder={store.reorderTopics}
            onDragStateChange={setIsDragging}
            draggableCount={topicItems.filter((t) => !t.comingSoon && store.topics[t.key]).length}
            renderItem={(item) => {
              const isOn = !item.comingSoon && store.topics[item.key];
              return (
                <View style={[lcStyles.card, {
                  backgroundColor: colors.card,
                  borderColor: colors.borderLight,
                  opacity: item.comingSoon ? 0.45 : (isOn ? 1 : 0.45),
                  shadowColor: '#000',
                  shadowOffset: { width: 0, height: isOn ? 4 : 2 },
                  shadowOpacity: isOn ? 0.12 : 0.07,
                  shadowRadius: isOn ? 8 : 5,
                  elevation: isOn ? 5 : 3,
                }]}>
                  <View style={lcStyles.mainRow}>
                    <Ionicons name="reorder-three-outline" size={20} color={colors.inkFaint} style={{ marginRight: 4, opacity: isOn ? 1 : 0 }} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.rowLabel, { color: colors.inkDark, fontFamily: fontFamily.regular, fontSize: fontSize.body, flex: 0 }]}>
                        {item.label}
                      </Text>
                      {isOn && GENRE_SETTINGS_DISCLAIMER[item.key] && (
                        <Text style={{ color: colors.inkFaint, fontFamily: fontFamily.regular, fontSize: 10, fontStyle: 'italic', marginTop: 3, textAlign: 'left' }}>
                          {GENRE_SETTINGS_DISCLAIMER[item.key]}
                        </Text>
                      )}
                    </View>
                    {item.comingSoon ? (
                      <View style={[styles.comingSoonBadge, { borderColor: colors.borderMid }]}>
                        <Text style={[styles.comingSoonText, { color: colors.inkFaint, fontFamily: fontFamily.regular }]}>
                          Coming Soon
                        </Text>
                      </View>
                    ) : (
                      <Switch
                        value={store.topics[item.key]}
                        onValueChange={() => {
                          LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                          store.toggleTopic(item.key);
                        }}
                        trackColor={{ false: isDark ? 'rgba(255,255,255,0.20)' : colors.borderMid, true: colors.chrome }}
                        thumbColor="#FFF"
                      />
                    )}
                  </View>
                </View>
              );
            }}
          />
        </ScrollView>

        {/* ── Page 2: Display ── */}
        <ScrollView
          style={[styles.pageScroll, { backgroundColor: colors.bg }]}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          directionalLockEnabled
          showsVerticalScrollIndicator={false}
          scrollEventThrottle={16}
          onScroll={onScrollTabBar}
        >
          <SectionHeader title="Display" colors={colors} fontFamily={fontFamily} />

          <Text style={[styles.fieldLabel, { color: colors.inkDark, fontFamily: fontFamily.regular }]}>Preview</Text>
          <DisplayPreview colors={colors} fontFamily={fontFamily} fontSize={fontSize} />

          {/* Theme tile — colour chips + auto night mode */}
          <Text style={[styles.fieldLabel, { color: colors.inkDark, fontFamily: fontFamily.regular }]}>Theme</Text>
          <View style={[styles.displayTileOuter, { borderColor: colors.borderLight, backgroundColor: colors.card }]}>
            <View style={styles.themeChipsRow}>
              {BACKGROUNDS.map((bg) => {
                const selected = store.background === bg.key;
                return (
                  <TouchableOpacity
                    key={bg.key}
                    onPress={() => store.setBackground(bg.key)}
                    activeOpacity={0.8}
                    style={[styles.themeChip, {
                      backgroundColor: bg.color,
                      borderColor: selected ? bg.ink : bg.ink + '30',
                      borderWidth: selected ? 1.5 : StyleSheet.hairlineWidth,
                    }]}
                  >
                    <Text style={[styles.themeChipLabel, { color: bg.ink, fontFamily: selected ? fontFamily.bold : fontFamily.regular }]}>
                      {bg.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <View style={[styles.displayTileRow, { borderTopColor: colors.borderLight, borderTopWidth: StyleSheet.hairlineWidth }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.rowLabel, { color: colors.inkDark, fontFamily: fontFamily.regular, fontSize: fontSize.body }]}>Auto Night Mode</Text>
                <Text style={[styles.rowSub, { color: colors.inkFaint }]}>Switches to a dark theme at night with iOS</Text>
              </View>
              <Switch
                value={store.autoNightMode}
                onValueChange={store.setAutoNightMode}
                trackColor={{ false: isDark ? 'rgba(255,255,255,0.20)' : colors.borderMid, true: colors.chrome }}
                thumbColor="#FFF"
              />
            </View>
          </View>

          {/* Font tile */}
          <Text style={[styles.fieldLabel, { color: colors.inkDark, fontFamily: fontFamily.regular }]}>Font</Text>
          <View style={[styles.displayTileOuter, { borderColor: colors.borderLight, backgroundColor: colors.card }]}>
            {(['lora', 'garamond', 'playfair', 'times'] as FontFamilyKey[]).map((key, i) => {
              const fam = FontFamilies[key];
              const selected = store.fontFamily === key;
              return (
                <TouchableOpacity
                  key={key}
                  style={[styles.displayTileRow, { borderTopColor: colors.borderLight }, i === 0 && { borderTopWidth: 0 }]}
                  onPress={() => store.setFontFamily(key)}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.fontSample, { fontFamily: fam.regular, color: colors.inkDark }]}>{fam.label}</Text>
                    <Text style={[styles.fontPreview, { fontFamily: fam.italic, color: colors.inkLight }]}>The quick brown fox</Text>
                  </View>
                  {selected && <Ionicons name="checkmark-circle" size={22} color={colors.inkDark} />}
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Text Size tile */}
          <Text style={[styles.fieldLabel, { color: colors.inkDark, fontFamily: fontFamily.regular }]}>Text Size</Text>
          <View style={[styles.displayTileOuter, { borderColor: colors.borderLight, backgroundColor: colors.card }]}>
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
              containerStyle={{ marginHorizontal: 0, marginBottom: 0, borderWidth: 0, backgroundColor: colors.card }}
            />
          </View>

          {/* App Icon */}
          <Text style={[styles.fieldLabel, { color: colors.inkDark, fontFamily: fontFamily.regular }]}>App Icon</Text>
          <View style={[styles.displayTileOuter, { borderColor: colors.borderLight, backgroundColor: colors.card }]}>
            <View style={styles.iconRow}>
              {APP_ICONS.map((icon) => {
                const active = store.appIcon === icon.name;
                return (
                  <TouchableOpacity
                    key={icon.name ?? 'default'}
                    style={styles.iconTile}
                    onPress={() => {
                      store.setAppIcon(icon.name);
                      applyNativeIcon(icon.name);
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
          </View>

        </ScrollView>

        {/* ── Page 3: Profile ── */}
        <ScrollView
          style={[styles.pageScroll, { backgroundColor: colors.bg }]}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          directionalLockEnabled
          showsVerticalScrollIndicator={false}
          scrollEventThrottle={16}
          onScroll={onScrollTabBar}
        >
          {/* Profile Avatar */}
          <View style={profileStyles.avatarSection}>
            <TouchableOpacity
              onPress={() => setSettingsSheetVisible(true)}
              activeOpacity={0.8}
              style={profileStyles.avatarWrap}
            >
              <View style={[profileStyles.avatar, { backgroundColor: colors.chrome }]}>
                <Text style={[profileStyles.avatarInitials, { fontFamily: fontFamily.bold, color: colors.bg }]}>
                  {displayName ? displayName.charAt(0).toUpperCase() : 'G'}
                </Text>
              </View>
              <View style={[profileStyles.avatarCameraIcon, { backgroundColor: colors.accentRed }]}>
                <Ionicons name="camera-outline" size={12} color="#FFF" />
              </View>
            </TouchableOpacity>
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
            style={[styles.displayTileOuter, profileStyles.settingsButton, {
              backgroundColor: colors.card,
              borderColor: colors.borderLight,
              marginBottom: Spacing.md,
            }]}
            onPress={() => setSettingsSheetVisible(true)}
          >
            <Text style={[profileStyles.settingsButtonText, { color: colors.inkDark, fontFamily: fontFamily.regular, fontSize: fontSize.body }]}>
              Account Settings
            </Text>
            <Ionicons name="chevron-forward" size={16} color={colors.inkFaint} />
          </TouchableOpacity>

          {/* Language filter tile — between Account Settings and Daily Streaks */}
          {Object.keys(readingHistory).some(c => readingHistory[c].length > 0) && (
            <View style={[styles.displayTileOuter, profileStyles.langFilterTile, { backgroundColor: colors.card, borderColor: colors.borderLight }]}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={profileStyles.langFilterContent}>
                <TouchableOpacity
                  style={[profileStyles.langFilterChip, filterLang === 'all' && { backgroundColor: colors.inkDark }]}
                  onPress={() => setFilterLang('all')}
                  activeOpacity={0.7}
                >
                  <GlobeCircle size={18} />
                  <Text style={[profileStyles.langFilterLabel, { color: filterLang === 'all' ? colors.bg : colors.inkFaint, fontFamily: filterLang === 'all' ? fontFamily.bold : fontFamily.regular }]}>
                    All
                  </Text>
                </TouchableOpacity>
                {Object.keys(readingHistory).filter(c => readingHistory[c].length > 0).map(code => (
                  <TouchableOpacity
                    key={code}
                    style={[profileStyles.langFilterChip, filterLang === code && { backgroundColor: colors.inkDark }]}
                    onPress={() => setFilterLang(code)}
                    activeOpacity={0.7}
                  >
                    <FlagCircle code={code} size={18} />
                    <Text style={[profileStyles.langFilterLabel, { color: filterLang === code ? colors.bg : colors.inkFaint, fontFamily: filterLang === code ? fontFamily.bold : fontFamily.regular }]}>
                      {langDisplayCode(code)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}

          {/* Daily Streaks tile */}
          <View style={[styles.displayTileOuter, { backgroundColor: colors.card, borderColor: colors.borderLight }]}>
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
              <View style={profileStyles.streakRight}>
                {filterLang === 'all' ? <GlobeCircle size={14} /> : <FlagCircle code={filterLang} size={14} />}
                {(() => {
                  const n = filterLang === 'all' ? maxStreak : (readingStreaks[filterLang] ?? 0);
                  return (
                    <Text style={[profileStyles.streakBadgeText, { color: colors.accentRed, fontFamily: fontFamily.bold }]}>
                      {n} day{n !== 1 ? 's' : ''}
                    </Text>
                  );
                })()}
              </View>
            </View>
            <FullStreakCalendar
              readingHistory={readingHistory}
              filterLang={filterLang}
              activeLang={filterLang}
              onLangChange={setFilterLang}
              readingStreaks={readingStreaks}
              hideTabs
              headerStyle="subtle"
              hideStreakLabel
            />
          </View>
        </ScrollView>
      </ScrollView>

      {/* ── Settings bottom sheet ── */}
      <Modal
        visible={settingsSheetVisible}
        transparent
        animationType="slide"
        onRequestClose={() => { sheetDragY.setValue(0); setSettingsSheetVisible(false); }}
      >
        <View style={modalStyles.overlay}>
          <TouchableOpacity
            style={StyleSheet.absoluteFillObject}
            activeOpacity={1}
            onPress={() => { sheetDragY.setValue(0); setSettingsSheetVisible(false); }}
          />
          <Animated.View
            style={[modalStyles.sheet, { backgroundColor: colors.surface, transform: [{ translateY: sheetDragY }] }]}
          >
            {/* Drag handle */}
            <View style={sheetStyles.handleRow} {...sheetPanResponder.panHandlers}>
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
                  <Text style={[styles.rowSub, { color: colors.inkFaint }]}>Brief usually ready by {PIPELINE_READY_TIME}</Text>
                </View>
                <TimeInput
                  value={store.briefingNotificationTime}
                  onChange={store.setBriefingNotificationTime}
                  onCommit={() => {
                    const { languages, topicOrder, topics, briefingNotificationTime } = store;
                    const { lastReadDates } = useStreakStore.getState();
                    scheduleAllNotifications({
                      briefingTime: briefingNotificationTime,
                      topicOrder: topicOrder ?? [],
                      topics: topics as Record<string, boolean>,
                      activeLanguages: languages.filter((l) => l.active).map((l) => ({ code: l.code, name: l.name })),
                      lastReadDates,
                    });
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

              {isAdminEmail(userEmail) && (
                <>
                  <SectionHeader title="Admin" colors={colors} fontFamily={fontFamily} />
                  <TouchableOpacity
                    style={[styles.row, { borderBottomColor: colors.borderLight }]}
                    onPress={() => setAnalyticsVisible(true)}
                  >
                    <Text style={[styles.rowLabel, { color: colors.inkDark, fontFamily: fontFamily.regular, fontSize: fontSize.body }]}>
                      Analytics
                    </Text>
                    <Ionicons name="chevron-forward" size={16} color={colors.inkFaint} />
                  </TouchableOpacity>
                </>
              )}

              {/* Legal & Support */}
              <SectionHeader title="Legal & Support" colors={colors} fontFamily={fontFamily} />
              <TouchableOpacity
                style={[styles.row, { borderBottomColor: colors.borderLight }]}
                onPress={() => openLegalDoc('privacy')}
              >
                <Text style={[styles.rowLabel, { color: colors.inkDark, fontFamily: fontFamily.regular, fontSize: fontSize.body }]}>
                  Privacy Policy
                </Text>
                <Ionicons name="open-outline" size={15} color={colors.inkFaint} />
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.row, { borderBottomColor: colors.borderLight }]}
                onPress={() => openLegalDoc('terms')}
              >
                <Text style={[styles.rowLabel, { color: colors.inkDark, fontFamily: fontFamily.regular, fontSize: fontSize.body }]}>
                  Terms of Service
                </Text>
                <Ionicons name="open-outline" size={15} color={colors.inkFaint} />
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.row, { borderBottomColor: colors.borderLight }]}
                onPress={openSupportForm}
              >
                <Text style={[styles.rowLabel, { color: colors.inkDark, fontFamily: fontFamily.regular, fontSize: fontSize.body }]}>
                  Contact Support
                </Text>
                <Ionicons name="chevron-forward" size={16} color={colors.inkFaint} />
              </TouchableOpacity>
              <Text style={[legalStyles.version, { color: colors.inkFaint, fontFamily: fontFamily.regular }]}>
                Bilinguist Brief · Version {APP_VERSION}
              </Text>
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
                            const length = (lang.readLength === 'short' ? 'short' : 'longer') as ArticleLength;
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
          </Animated.View>
        </View>
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
            {(() => {
              const code = levelModal?.code;
              if (!code) return [];
              const rl = levelModal?.readLength;
              const fromBrief = (rl === 'short' || rl === 'longer')
                ? availableLevelsByLangAndLength[code]?.[rl] ?? availableLevelsByLang[code]
                : availableLevelsByLang[code];
              if (fromBrief && fromBrief.length > 0) return fromBrief;
              const currentLevel = levelModal?.level;
              return currentLevel ? [currentLevel] : [];
            })().map((level) => {
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
                      analytics.trackLevelSelected(levelModalLang, level);
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
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <TouchableOpacity
            style={modalStyles.overlay}
            activeOpacity={1}
            onPress={() => setSignInModalVisible(false)}
          >
            <TouchableOpacity activeOpacity={1} style={[modalStyles.sheet, { backgroundColor: colors.surface }]}>
              <Text style={[modalStyles.title, { color: colors.inkDark, fontFamily: fontFamily.bold }]}>
                {authMode === 'signin' ? 'Sign in' : 'Create account'}
              </Text>

              {/* Social sign-in */}
              {appleAvailable && (
                <View style={{ paddingHorizontal: Spacing.lg, paddingBottom: Spacing.sm }}>
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

              <TouchableOpacity
                style={[sheetStyles.googleButton, { borderColor: colors.borderMid, backgroundColor: colors.bg }]}
                onPress={handleGoogleSignIn}
                disabled={authLoading}
              >
                <Text style={[sheetStyles.googleButtonText, { color: colors.inkDark, fontFamily: fontFamily.regular }]}>
                  Continue with Google
                </Text>
              </TouchableOpacity>

              <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.lg, marginBottom: Spacing.md }}>
                <View style={{ flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.borderMid }} />
                <Text style={{ color: colors.inkFaint, fontFamily: fontFamily.regular, fontSize: 12, marginHorizontal: 10 }}>or</Text>
                <View style={{ flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.borderMid }} />
              </View>

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
                style={[modalStyles.codeButton, { backgroundColor: colors.accentRed, marginHorizontal: Spacing.lg, marginTop: Spacing.md, opacity: authLoading ? 0.6 : 1 }]}
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
            </TouchableOpacity>
          </TouchableOpacity>
        </KeyboardAvoidingView>
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

      {/* ── Support form ── */}
      <Modal
        visible={supportModalVisible}
        transparent
        animationType="slide"
        onRequestClose={closeSupportModal}
      >
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={[legalStyles.supportContainer, { backgroundColor: colors.surface }]}>
            <View style={sheetStyles.handleRow}>
              <View style={[sheetStyles.handle, { backgroundColor: colors.borderMid }]} />
            </View>
            <View style={sheetStyles.titleRow}>
              <TouchableOpacity onPress={closeSupportModal}>
                <Ionicons name="chevron-back" size={24} color={colors.inkDark} />
              </TouchableOpacity>
              <Text style={[sheetStyles.sheetTitle, { color: colors.inkDark, fontFamily: fontFamily.bold }]}>
                Contact Support
              </Text>
              <View style={{ width: 24 }} />
            </View>

            {supportState === 'success' ? (
              <View style={legalStyles.successContainer}>
                <Ionicons name="checkmark-circle-outline" size={52} color={colors.chrome} />
                <Text style={[legalStyles.successTitle, { color: colors.inkDark, fontFamily: fontFamily.bold }]}>
                  Message sent
                </Text>
                <Text style={[legalStyles.successBody, { color: colors.inkFaint, fontFamily: fontFamily.regular }]}>
                  Thanks, we'll get back to you soon.
                </Text>
                <TouchableOpacity
                  style={[modalStyles.codeButton, { backgroundColor: colors.chrome, marginTop: Spacing.xl, marginHorizontal: Spacing.lg }]}
                  onPress={closeSupportModal}
                >
                  <Text style={modalStyles.codeButtonText}>Done</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 32 }}>
                <Text style={[styles.helper, { color: colors.inkFaint, fontFamily: fontFamily.regular }]}>
                  {userEmail ? `Signed in as ${userEmail}` : 'Not signed in'} · Version {APP_VERSION} · iOS
                </Text>

                <TextInput
                  style={[legalStyles.subjectInput, { borderColor: colors.borderMid, color: colors.inkDark, fontFamily: fontFamily.regular, backgroundColor: colors.card }]}
                  value={supportSubject}
                  onChangeText={setSupportSubject}
                  placeholder="Subject"
                  placeholderTextColor={colors.inkFaint}
                  returnKeyType="next"
                  maxLength={120}
                />

                <TextInput
                  style={[legalStyles.messageInput, { borderColor: colors.borderMid, color: colors.inkDark, fontFamily: fontFamily.regular, backgroundColor: colors.card }]}
                  value={supportBody}
                  onChangeText={setSupportBody}
                  placeholder="Describe your issue or question…"
                  placeholderTextColor={colors.inkFaint}
                  multiline
                  textAlignVertical="top"
                />

                {supportState === 'error' && (
                  <Text style={[legalStyles.errorText, { fontFamily: fontFamily.regular }]}>
                    Something went wrong — please try again.
                  </Text>
                )}

                <TouchableOpacity
                  style={[
                    modalStyles.codeButton,
                    {
                      backgroundColor: colors.accentRed,
                      marginHorizontal: Spacing.md,
                      marginTop: Spacing.md,
                      opacity: supportLoading || !supportSubject.trim() || !supportBody.trim() ? 0.5 : 1,
                    },
                  ]}
                  onPress={handleSupportSubmit}
                  disabled={supportLoading || !supportSubject.trim() || !supportBody.trim()}
                >
                  <Text style={modalStyles.codeButtonText}>
                    {supportLoading ? 'Sending…' : 'Send message'}
                  </Text>
                </TouchableOpacity>
              </ScrollView>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Legal documents ── */}
      <LegalDocModal
        visible={legalDocVisible}
        initialDoc={legalDocInitial}
        onClose={closeLegalDoc}
      />

      {/* ── Admin-only Analytics ── */}
      <Modal
        visible={analyticsVisible}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setAnalyticsVisible(false)}
      >
        <AnalyticsScreen onClose={() => setAnalyticsVisible(false)} />
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
    fontSize: 13,
    letterSpacing: 1.8,
    fontWeight: '600',
    marginHorizontal: Spacing.md,
    marginTop: Spacing.lg,
    marginBottom: Spacing.sm,
    textTransform: 'uppercase',
  },
  displayTileOuter: {
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.sm,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 5,
    elevation: 3,
  },
  themeChipsRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    padding: Spacing.md,
  },
  themeChip: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  themeChipLabel: { fontSize: 13 },
  displayTileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: Spacing.sm,
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
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.md,
  },
  iconTile: {
    width: '33.33%',
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
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  title: { fontSize: 26 },
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
    justifyContent: 'center',
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
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 5,
    elevation: 3,
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
  avatarWrap: {
    marginBottom: Spacing.sm,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarCameraIcon: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFF',
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
    paddingHorizontal: Spacing.md,
    paddingVertical: 14,
    gap: Spacing.sm,
  },
  settingsButtonText: {
    flex: 1,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.md,
  },
  langFilterTile: {
    marginBottom: Spacing.md,
  },
  langFilterContent: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  langFilterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
  },
  langFilterLabel: {
    fontSize: 13,
    letterSpacing: 0.2,
  },
  streakHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 5,
  },
  streakBadgeText: {
    fontSize: 13,
  },
});

const legalStyles = StyleSheet.create({
  version: {
    fontSize: 12,
    textAlign: 'center',
    paddingVertical: Spacing.md,
    opacity: 0.6,
  },
  supportContainer: {
    flex: 1,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    marginTop: 60,
  },
  subjectInput: {
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
    fontSize: 15,
  },
  messageInput: {
    marginHorizontal: Spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
    fontSize: 15,
    minHeight: 160,
  },
  errorText: {
    color: '#E53935',
    fontSize: 13,
    marginHorizontal: Spacing.md,
    marginTop: Spacing.xs,
  },
  successContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
    paddingBottom: 80,
  },
  successTitle: {
    fontSize: 20,
    marginTop: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  successBody: {
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
  },
});

const sheetStyles = StyleSheet.create({
  handleRow: {
    alignItems: 'center',
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.md,
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
