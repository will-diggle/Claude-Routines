import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import {
  AppState, AppStateStatus, ScrollView, RefreshControl, StyleSheet,
  View, Text, Image, Dimensions, Modal, TouchableOpacity,
  NativeScrollEvent, NativeSyntheticEvent, Animated, useWindowDimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { briefingScrollY } from '../store/sharedBriefingScroll';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useShallow } from 'zustand/react/shallow';
import { useSettingsStore, langDisplayCode } from '../store/useSettingsStore';
import { useBriefingStore } from '../store/useBriefingStore';
import { useNavPillStore } from '../store/useNavPillStore';
import { useTheme } from '../hooks/useTheme';
import { Colors } from '../theme';
import { LanguageBriefingSection } from '../components/LanguageBriefingSection';
import { useStreakStore } from '../store/useStreakStore';

import { FullStreakCalendar } from '../components/StreakCalendar';
import { FlagCircle, GlobeCircle } from '../components/FlagCircle';
import { StreakCelebrationModal } from '../components/StreakCelebrationModal';
import { FullSweepModal } from '../components/FullSweepModal';
import { NewLanguageAnnouncementModal, useNewLanguageAnnouncement } from '../components/NewLanguageAnnouncementModal';
import { FLOAT_TAB_BOTTOM, FLOAT_TAB_INSET } from '../components/FloatingTabBar';
import type { ArticleLength, GeneratedBriefing } from '../services/anthropic';
import type { LanguageCode, LanguageLevel } from '../store/useSettingsStore';
import * as Haptics from 'expo-haptics';
import * as analytics from '../services/analytics';
import { scheduleStreakReminder } from '../services/notifications';
import { useIsFocused } from '@react-navigation/native';

const MASTHEADS: Record<string, ReturnType<typeof require>> = {
  cream:    require('../../assets/masthead-compact-cream.png'),
  softGrey: require('../../assets/masthead-compact-navy.png'),
  white:    require('../../assets/masthead-compact-white.png'),
  night:    require('../../assets/masthead-compact-black.png'),
};

const CRESTS: Record<string, ReturnType<typeof require>> = {
  cream:    require('../../assets/splash-crest-cream.png'),
  softGrey: require('../../assets/splash-crest-navy.png'),
  white:    require('../../assets/splash-crest-white.png'),
  night:    require('../../assets/splash-crest-black.png'),
};

const SCREEN_WIDTH  = Dimensions.get('window').width;
const SCREEN_HEIGHT = Dimensions.get('window').height;
const IS_TABLET = SCREEN_WIDTH >= 768;
const LOCKUP_PADDING = 0;
// Nav-pill collapse thresholds. Collapse once scrolled past PILL_COLLAPSE_Y;
// only re-expand within PILL_TOP_EPS of the top, so the pill doesn't reopen
// part-way through an upward scroll.
const PILL_COLLAPSE_Y = 80;
const PILL_TOP_EPS    = 4;
const LOCKUP_W = Math.round(SCREEN_WIDTH * (IS_TABLET ? 0.55 : 1.18)); // oversize on phone to fill whitespace in PNG
const LOCKUP_H = Math.round(LOCKUP_W / 6.21); // 4012×646 source ratio

// "Native" word in each language (for level chip labels like "B2 / Natif")
const NATIVE_WORD: Record<string, string> = {
  en: 'Native', fr: 'Natif', de: 'Mutterspr.',
  es: 'Nativo', pt: 'Nativo', it: 'Madrelingua', sv: 'Modersmål', tr: 'Yerel', hu: 'Anyanyelvi',
};

// Localized short/long labels — must match SettingsScreen's LENGTH_LABELS
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

// City names in each language's native form (fallback)
const LANG_CITY_NATIVE: Record<string, string> = {
  en: 'London', fr: 'Paris',  de: 'Berlin', es: 'Madrid',
  pt: 'Brasil', it: 'Roma', sv: 'Stockholm', tr: 'Ankara', hu: 'Budapest', ar: 'الرياض',
};

// Each language's capital city translated into every display language.
// Row = the language whose city it is; column = the language to display it in.
const CITY_IN_LANG: Record<string, Partial<Record<string, string>>> = {
  en: { en: 'London',    fr: 'Londres',   de: 'London',    es: 'Londres',   pt: 'Londres',   it: 'Londra',    sv: 'London',    tr: 'Londra',    hu: 'London',    ar: 'لندن'    },
  fr: { en: 'Paris',     fr: 'Paris',     de: 'Paris',     es: 'París',     pt: 'Paris',     it: 'Parigi',    sv: 'Paris',     tr: 'Paris',     hu: 'Párizs',    ar: 'باريس'   },
  de: { en: 'Berlin',    fr: 'Berlin',    de: 'Berlin',    es: 'Berlín',    pt: 'Berlim',    it: 'Berlino',   sv: 'Berlin',    tr: 'Berlin',    hu: 'Berlin',    ar: 'برلين'   },
  es: { en: 'Madrid',    fr: 'Madrid',    de: 'Madrid',    es: 'Madrid',    pt: 'Madrid',    it: 'Madrid',    sv: 'Madrid',    tr: 'Madrid',    hu: 'Madrid',    ar: 'مدريد'   },
  pt: { en: 'Brazil',    fr: 'Brésil',    de: 'Brasilien',  es: 'Brasil',    pt: 'Brasil',    it: 'Brasile',   sv: 'Brasilien',  tr: 'Brezilya',  hu: 'Brazília',  ar: 'البرازيل'  },
  it: { en: 'Rome',      fr: 'Rome',      de: 'Rom',       es: 'Roma',      pt: 'Roma',      it: 'Roma',      sv: 'Rom',       tr: 'Roma',      hu: 'Róma',      ar: 'روما'    },
  sv: { en: 'Stockholm', fr: 'Stockholm', de: 'Stockholm', es: 'Estocolmo', pt: 'Estocolmo', it: 'Stoccolma', sv: 'Stockholm', tr: 'Stokholm',  hu: 'Stockholm', ar: 'ستوكهولم'},
  tr: { en: 'Ankara',    fr: 'Ankara',    de: 'Ankara',    es: 'Ankara',    pt: 'Ancara',    it: 'Ankara',    sv: 'Ankara',    tr: 'Ankara',    hu: 'Ankara',    ar: 'أنقرة'   },
  hu: { en: 'Budapest',  fr: 'Budapest',  de: 'Budapest',  es: 'Budapest',  pt: 'Budapeste', it: 'Budapest',  sv: 'Budapest',  tr: 'Budapeşte', hu: 'Budapest',  ar: 'بودابست' },
  ar: { en: 'Riyadh',    fr: 'Riyad',     de: 'Riad',      es: 'Riad',      pt: 'Riade',     it: 'Riyad',     sv: 'Riyad',     tr: 'Riyad',     hu: 'Rijád',     ar: 'الرياض'  },
};

// BCP-47 locale for date/time formatting on each page
const LANG_LOCALE: Record<string, string> = {
  en: 'en-GB',
  fr: 'fr-FR',
  de: 'de-DE',
  es: 'es-ES',
  pt: 'pt-BR',
  it: 'it-IT',
  sv: 'sv-SE',
  tr: 'tr-TR',
  hu: 'hu-HU',
  ar: 'ar-SA',
};

// "Published" prefix in each language
const PUBLISHED_PREFIX: Record<string, string> = {
  en: 'Published',
  fr: 'Publié le',
  de: 'Veröffentlicht am',
  es: 'Publicado el',
  pt: 'Publicado em',
  it: 'Pubblicato il',
  sv: 'Publicerad',
  tr: 'Yayınlandı',
  hu: 'Közzétéve',
  ar: 'نُشر في',
};

// "N-day streak" phrase in each language — {n} is replaced with the count
const STREAK_PHRASE: Record<string, string> = {
  en: '{n} DAY STREAK',
  fr: '{n} JOURS D\'AFFILÉE',
  de: '{n} TAGE AM STÜCK',
  es: 'RACHA DE {n} DÍAS',
  it: '{n} GIORNI DI FILA',
  sv: '{n} DAGARS SVIT',
  tr: '{n} GÜNLÜK SERİ',
  hu: '{n} NAPOS SOROZAT',
  ar: 'سلسلة {n} أيام',
};

function streakPhrase(lang: string, n: number): string {
  return (STREAK_PHRASE[lang] ?? STREAK_PHRASE.en).replace('{n}', String(n));
}

// Taglines indexed by [mono=0, bi=1, tri=2, multi=3]
const TAGLINES: Record<string, [string, string, string, string]> = {
  en: ['Your daily brief',          'Your bilingual brief',        'Your trilingual brief',         'Your multilingual brief'       ],
  fr: ['Votre brief quotidien',      'Votre brief bilingue',        'Votre brief trilingue',         'Votre brief multilingue'       ],
  de: ['Ihr tägliches Briefing',     'Ihr zweisprachiges Briefing', 'Ihr dreisprachiges Briefing',   'Ihr mehrsprachiges Briefing'   ],
  es: ['Su brief diario',            'Su brief bilingüe',           'Su brief trilingüe',            'Su brief multilingüe'          ],
  it: ['Il tuo brief quotidiano',    'Il tuo brief bilingue',       'Il tuo brief trilingue',        'Il tuo brief multilingue'      ],
  sv: ['Din dagliga brief',          'Din tvåspråkiga brief',       'Din trespråkiga brief',         'Din flerspråkiga brief'        ],
  tr: ['Günlük brifinginiz',         'İki dilli brifinginiz',       'Üç dilli brifinginiz',          'Çok dilli brifinginiz'         ],
  hu: ['Napi briefinged',            'Kétnyelvű briefinged',        'Háromnyelvű briefinged',        'Többnyelvű briefinged'         ],
  ar: ['نشرتك اليومية',              'نشرتك الثنائية اللغة',        'نشرتك الثلاثية اللغة',          'نشرتك متعددة اللغات'           ],
};

function getTagline(langCode: string, count: number): string {
  const t = TAGLINES[langCode] ?? TAGLINES.en;
  const idx = count <= 1 ? 0 : count === 2 ? 1 : count === 3 ? 2 : 3;
  return t[idx];
}

function publishedDateStr(ts: number | null, langCode: string): string {
  const d = ts ? new Date(ts) : new Date();
  const locale = LANG_LOCALE[langCode] ?? 'en-GB';
  const prefix = PUBLISHED_PREFIX[langCode] ?? 'Published';
  const datePart = d.toLocaleDateString(locale, {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
  if (!ts) return `${prefix} ${datePart}`;
  const timePart = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return `${prefix} ${datePart} · ${timePart}`;
}

function chromeColor(background: string): string {
  if (background === 'cream')    return Colors.navyBg;
  if (background === 'softGrey') return Colors.cream;
  if (background === 'white')    return Colors.inkDark;
  return Colors.cream; // night
}

function hairlineColor(background: string): string {
  if (background === 'cream')    return 'rgba(22,32,50,0.32)';
  if (background === 'softGrey') return 'rgba(245,240,232,0.40)';
  if (background === 'white')    return 'rgba(26,26,26,0.30)';
  return 'rgba(245,240,232,0.40)';
}

function resolveLength(_level: LanguageLevel, readLength: ArticleLength): ArticleLength {
  // 'medium' was a legacy value — normalize to 'longer' so cache keys match the pipeline.
  return readLength === 'medium' ? 'longer' : readLength;
}

export function BriefingScreen() {
  const isFocused = useIsFocused();
  const { colors, fontFamily, background, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { width: winW, height: winH } = useWindowDimensions();
  const lockupW = Math.round(winW * (winW >= 768 ? 0.38 : 1.18));
  const lockupH = Math.round(lockupW / 6.21);
  const { languages, topics, setLanguageLevel, setLanguageReadLength } = useSettingsStore(
    useShallow((s) => ({ languages: s.languages, topics: s.topics, setLanguageLevel: s.setLanguageLevel, setLanguageReadLength: s.setLanguageReadLength }))
  );
  const {
    briefings, generatingFor, errorsFor, weatherByLang,
    syncFromServer, loadBriefing, loadWeather, clearError, bundleReceivedAt,
    availableLevelsByLang, availableLevelsByLangAndLength, nativeGradeByLang,
  } = useBriefingStore(useShallow((s) => ({
    briefings: s.briefings, generatingFor: s.generatingFor, errorsFor: s.errorsFor,
    weatherByLang: s.weatherByLang, syncFromServer: s.syncFromServer,
    loadBriefing: s.loadBriefing, loadWeather: s.loadWeather, clearError: s.clearError,
    bundleReceivedAt: s.bundleReceivedAt,
    availableLevelsByLang: s.availableLevelsByLang,
    availableLevelsByLangAndLength: s.availableLevelsByLangAndLength,
    nativeGradeByLang: s.nativeGradeByLang,
  })));

  const activeLanguages = useMemo(() => languages.filter((l) => l.active), [languages]);
  const langCount = activeLanguages.length;

  const { briefPageIndex, setBriefPageIndex, setBriefingScrolled } = useNavPillStore(
    useShallow((s) => ({ briefPageIndex: s.briefPageIndex, setBriefPageIndex: s.setBriefPageIndex, setBriefingScrolled: s.setBriefingScrolled }))
  );
  // Track scroll threshold without spamming Zustand on every frame
  const scrolledFlagRef = useRef(false);
  // Last seen offset, for direction detection (scroll-up reopens the pill
  // immediately, same "reveal on scroll-up" pattern as Safari's URL bar).
  const lastScrollYRef = useRef(0);

  const { recordRead, readingStreaks, readingHistory, lastReadDates, freezeDatesUsed, addReadingTime, getReadingTimeToday, checkAndConsumeFreeze, isFrozenToday, allReadToday, recordFullSweep, fullSweepShownToday, recordWordsRead, getWordsToday, getWordsLast7Days, wordsReadByDay, setConfettiActive } = useStreakStore();
  // Word count per language for current visible articles (updated by LanguageBriefingSection callback)
  const visibleWordCountRef = useRef<Record<string, number>>({});
  const [streakModalVisible, setStreakModalVisible] = useState(false);
  const [streakModalLang, setStreakModalLang] = useState<string>('all');
  const [calModalActiveLang, setCalModalActiveLang] = useState('all');
  const calSlideAnim = useRef(new Animated.Value(-12)).current;
  const calOpacityAnim = useRef(new Animated.Value(0)).current;
  const [streakAnchorY, setStreakAnchorY] = useState(0);
  const [weatherModalY, setWeatherModalY] = useState(0);
  const streakButtonRefs = useRef<Record<string, any>>({});
  const editionRowRef = useRef<View>(null);
  const [celebration, setCelebration] = useState<{ langCode: string; streakCount: number } | null>(null);
  const [fullSweepVisible, setFullSweepVisible] = useState(false);
  const { shouldShow: showPtAnnouncement, markSeen: markPtSeen } = useNewLanguageAnnouncement();
  const [levelPickerLang, setLevelPickerLang] = useState<string | null>(null);
  const [pickerLength, setPickerLength] = useState<'short' | 'longer'>('longer');
  // Per-language flags — reset from store on mount so app restarts don't double-credit
  const readTrackedRef = useRef<Record<string, boolean>>({});
  // Per-language: has 80% scroll been reached today?
  const scrollMetRef = useRef<Record<string, boolean>>({});
  // Per-language: max scroll depth reached (0–1) for analytics
  const scrollPctRef = useRef<Record<string, number>>({});
  // Seconds accumulated this session (not yet flushed to the store)
  const sessionTimeRef = useRef<Record<string, number>>({});
  // Interval ref for the 1-second reading timer
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Scroll indicator state ──────────────────────────────────────────────────

  const SCROLL_PILL_COLORS: Record<string, string> = {
    white:    '#222222',
    cream:    '#162032',
    softGrey: '#F5F0E8',
    night:    '#F0EDE6',
  };
  const scrollIndicatorProgress = useRef<Record<string, Animated.Value>>({});
  const scrollIndicatorOpacity  = useRef<Record<string, Animated.Value>>({});
  const scrollFadeTimer = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  function getScrollIndicatorValues(code: string) {
    if (!scrollIndicatorProgress.current[code]) {
      scrollIndicatorProgress.current[code] = new Animated.Value(0);
    }
    if (!scrollIndicatorOpacity.current[code]) {
      scrollIndicatorOpacity.current[code] = new Animated.Value(0);
    }
    return {
      progress: scrollIndicatorProgress.current[code],
      opacity:  scrollIndicatorOpacity.current[code],
    };
  }

  function handleScrollIndicator(
    code: string,
    contentOffsetY: number,
    contentHeight: number,
    visibleHeight: number,
  ) {
    const scrollable = contentHeight - visibleHeight;
    if (scrollable <= 0) return;
    const pct = Math.min(1, Math.max(0, contentOffsetY / scrollable));
    const { progress, opacity } = getScrollIndicatorValues(code);
    progress.setValue(pct);
    opacity.setValue(1);
    if (scrollFadeTimer.current[code]) clearTimeout(scrollFadeTimer.current[code]);
    scrollFadeTimer.current[code] = setTimeout(() => {
      Animated.timing(opacity, { toValue: 0, duration: 300, useNativeDriver: true }).start();
    }, 500);
  }
  // Which language page is currently visible
  const currentLangRef = useRef<string | null>(null);

  // Silently consume freezes for any active language that missed yesterday
  const checkFreezes = useCallback(() => {
    for (const lang of activeLanguages) {
      const froze = checkAndConsumeFreeze(lang.code);
      if (froze) {
        const cutoff = (() => {
          const d = new Date(); d.setDate(d.getDate() - 7);
          return d.toISOString().split('T')[0];
        })();
        const used = (useStreakStore.getState().freezeDatesUsed[lang.code] ?? []).filter(d => d >= cutoff);
        analytics.trackStreakFreezeUsed(lang.code);
      }
    }
  }, [activeLanguages, checkAndConsumeFreeze]);

  useEffect(() => {
    // Delay until after the splash screen finishes (3400 ms), by which point
    // the persisted language list has hydrated.
    const t = setTimeout(() => {
      checkFreezes();
    }, 4000);
    return () => clearTimeout(t);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Initialise the modal's length picker to the language's current readLength
  useEffect(() => {
    if (levelPickerLang !== null) {
      const lang = activeLanguages.find(l => l.code === levelPickerLang);
      const rl = lang?.readLength;
      setPickerLength(rl === 'short' ? 'short' : 'longer');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [levelPickerLang]);

  const langsWithHistory = useMemo(
    () => Object.keys(readingHistory).filter(code => readingHistory[code].length > 0),
    [readingHistory],
  );

  function openStreakModal(lang: string) {
    setStreakModalLang(lang);
    setCalModalActiveLang(lang);
    // Measure the tapped button's screen position so we can anchor below it.
    streakButtonRefs.current[lang]?.measure(
      (_x: number, _y: number, _w: number, h: number, _px: number, py: number) => {
        setStreakAnchorY(py + h + 6);
      }
    );
    calSlideAnim.setValue(-12);
    calOpacityAnim.setValue(0);
    setStreakModalVisible(true);
    Animated.parallel([
      Animated.spring(calSlideAnim, { toValue: 0, damping: 22, stiffness: 260, mass: 0.7, useNativeDriver: true }),
      Animated.timing(calOpacityAnim, { toValue: 1, duration: 160, useNativeDriver: true }),
    ]).start();
  }

  function closeStreakModal() {
    setStreakModalVisible(false);
  }

  // Initialize readTracked from store so returning users don't get double credit
  useEffect(() => {
    const today = new Date().toISOString().split('T')[0];
    for (const lang of activeLanguages) {
      if (lastReadDates[lang.code] === today) {
        readTrackedRef.current[lang.code] = true;
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Credit streak only when BOTH 90% scroll AND 30 seconds have been met
  const maybeCredit = useCallback((langCode: string) => {
    if (readTrackedRef.current[langCode]) return;
    const persisted = getReadingTimeToday(langCode);
    const session = sessionTimeRef.current[langCode] ?? 0;
    if (scrollMetRef.current[langCode] && (persisted + session) >= 30) {
      readTrackedRef.current[langCode] = true;
      if (session > 0) {
        addReadingTime(langCode, session);
        sessionTimeRef.current[langCode] = 0;
      }
      // Compute new streak before recording so we can show correct count
      const today = new Date().toISOString().split('T')[0];
      const yesterday = (() => { const d = new Date(); d.setDate(d.getDate() - 1); return d.toISOString().split('T')[0]; })();
      const store = useStreakStore.getState();
      const lastRead = store.lastReadDates[langCode];
      const current = store.readingStreaks[langCode] ?? 0;
      const newCount = lastRead === today ? current : lastRead === yesterday ? current + 1 : 1;
      // Credit the brief that's actually on screen. When today's hasn't
      // published, an earlier one is still up, and it must not earn a second
      // day's streak just for being displayed again.
      const shownDate = useBriefingStore.getState().briefings[langCode as LanguageCode]?.date;
      recordRead(langCode, shownDate);
      recordWordsRead(langCode, visibleWordCountRef.current[langCode] ?? 0, shownDate);
      // Reschedule streak reminder — removes this language from the "unread" list,
      // or cancels the notification entirely if all languages are now read.
      const { lastReadDates: lrd } = useStreakStore.getState();
      const activeLangs = useSettingsStore.getState().languages
        .filter((l) => l.active)
        .map((l) => ({ code: l.code, name: l.name }));
      scheduleStreakReminder(activeLangs, lrd).catch(() => {});
      const level = useSettingsStore.getState().languages.find(l => l.code === langCode)?.level ?? 'B1';
      const scrollPct = Math.round((scrollPctRef.current[langCode] ?? 0) * 100);
      analytics.trackBriefCompleted(langCode, level, scrollPct, persisted + session);
      if (newCount === 1 && current > 0) {
        analytics.trackStreakLost(langCode, current);
      } else {
        analytics.trackStreakIncremented(langCode, newCount);
      }
      // Full-sweep check: if this completes all languages, skip streak modal and show Full Sweep directly
      const activeCodes = useSettingsStore.getState().languages.filter(l => l.active).map(l => l.code);
      const { allReadToday: ard, fullSweepShownToday: fst, recordFullSweep: rfs } = useStreakStore.getState();
      if (activeCodes.length >= 2 && !fst() && ard(activeCodes)) {
        rfs();
        analytics.trackAllLanguagesRead(activeCodes.length);
        setFullSweepVisible(true);
      } else {
        setCelebration({ langCode, streakCount: newCount });
        setConfettiActive(true);
      }
      // Full-sweep check: if 2+ languages active and all are now read, queue it
      // (shown after individual streak modal is dismissed)
    }
  }, [getReadingTimeToday, addReadingTime, recordRead, recordWordsRead]);

  const flushCurrentLang = useCallback(() => {
    const lang = currentLangRef.current;
    if (lang && (sessionTimeRef.current[lang] ?? 0) > 0) {
      addReadingTime(lang, sessionTimeRef.current[lang]);
      sessionTimeRef.current[lang] = 0;
    }
  }, [addReadingTime]);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    flushCurrentLang();
  }, [flushCurrentLang]);

  const startTimer = useCallback((langCode: string) => {
    if (timerRef.current) clearInterval(timerRef.current);
    currentLangRef.current = langCode;
    timerRef.current = setInterval(() => {
      const lang = currentLangRef.current;
      if (!lang) return;
      sessionTimeRef.current[lang] = (sessionTimeRef.current[lang] ?? 0) + 1;
      maybeCredit(lang);
    }, 1000);
  }, [maybeCredit]);

  const [refreshing, setRefreshing] = useState(false);
  const lastValidBriefingsRef = useRef<Partial<Record<string, GeneratedBriefing>>>({});
  const lastSyncRef = useRef<number>(0);
  const pagerRef = useRef<ScrollView>(null);
  const langScrollRefs = useRef<Map<string, ScrollView>>(new Map());
  // Prevents the pill→pager scroll from bouncing back as a user-swipe event
  const programmaticScrollRef = useRef(false);

  const activeLangKey =
    activeLanguages.map((l) => `${l.code}:${l.level ?? 'B1'}:${resolveLength(l.level ?? 'B1', (l.readLength ?? 'longer') as ArticleLength)}`).join(',');

  const runSync = useCallback(async (force = false) => {
    try {
      lastSyncRef.current = Date.now();
      const langs = useSettingsStore.getState().languages.filter((l) => l.active);
      await syncFromServer(force);
      await Promise.all(langs.map((lang) => {
        const level = lang.level ?? 'B1';
        return loadBriefing(lang.code, level, resolveLength(level, (lang.readLength ?? 'longer') as ArticleLength), true);
      }));
      await Promise.all(langs.map((lang) => loadWeather(lang.code)));
    } catch {}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeLangKey]);

  useEffect(() => {
    runSync();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeLangKey]);

  // Retry weather for any active language whose data is missing (e.g. failed on first fetch)
  useEffect(() => {
    const missing = activeLanguages.filter((l) => !weatherByLang[l.code]);
    if (missing.length === 0) return;
    const t = setTimeout(() => {
      missing.forEach((l) => loadWeather(l.code));
    }, 4000);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weatherByLang]);

  // Track brief_opened when user navigates between language pages
  useEffect(() => {
    const lang = activeLanguages[briefPageIndex];
    if (lang) {
      const level = lang.level ?? 'B1';
      const date = new Date().toISOString().split('T')[0];
      analytics.trackBriefOpened(lang.code, level, date);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [briefPageIndex]);

  // When pill taps a language tab, scroll the pager to match
  useEffect(() => {
    const clamped = Math.min(briefPageIndex, Math.max(0, langCount - 1));
    programmaticScrollRef.current = true;
    pagerRef.current?.scrollTo({ x: clamped * winW, animated: false });
    const t = setTimeout(() => { programmaticScrollRef.current = false; }, 700);
    return () => clearTimeout(t);
  // winW in deps so the pager re-snaps to the current page on orientation change
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [briefPageIndex, langCount, winW]);

  // Clamp briefPageIndex when active languages are removed
  useEffect(() => {
    if (briefPageIndex >= langCount) {
      setBriefPageIndex(Math.max(0, langCount - 1));
    }
  }, [langCount]);

  // Reset dock state and start reading timer when user swipes to a new language page
  useEffect(() => {
    briefingScrollY.setValue(0);
    scrolledFlagRef.current = false;
    lastScrollYRef.current = 0;
    setBriefingScrolled(false);
    const lang = activeLanguages[briefPageIndex]?.code;
    if (lang) startTimer(lang);
    return () => stopTimer();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [briefPageIndex]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active') {
        // Resume reading timer for current language
        const lang = activeLanguages[briefPageIndex]?.code;
        if (lang) startTimer(lang);
        // Silently apply any pending freezes for missed days
        checkFreezes();
        // Sync if stale
        if (Date.now() - lastSyncRef.current >= 30_000) runSync();
      } else {
        // App backgrounded — pause timer and flush accumulated time
        stopTimer();
      }
    });
    return () => sub.remove();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runSync, briefPageIndex, startTimer, stopTimer]);

  // Stop the timer when the user navigates to another screen; restart on return.
  useEffect(() => {
    if (isFocused) {
      const lang = activeLanguages[briefPageIndex]?.code;
      if (lang) startTimer(lang);
    } else {
      stopTimer();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFocused]);

  useEffect(() => {
    const id = setInterval(() => runSync(), 10 * 60 * 1000);
    return () => clearInterval(id);
  }, [runSync]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await runSync(true).catch(() => {});
    setRefreshing(false);
  }, [runSync]);

  const handlePageScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (programmaticScrollRef.current) return;
    const page = Math.round(e.nativeEvent.contentOffset.x / winW);
    if (page !== briefPageIndex) setBriefPageIndex(page);
  }, [briefPageIndex, setBriefPageIndex, winW]);

  const chrome   = chromeColor(background);
  const hairline = hairlineColor(background);

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      {/* Fixed page dots — outside pager so they never move with horizontal or vertical scroll.
          Fade out + slide up as the user scrolls down so they don't obscure content. */}
      {langCount > 1 && (
        <Animated.View
          style={[
            styles.fixedDots,
            { top: insets.top + 2 },
            {
              opacity: briefingScrollY.interpolate({
                inputRange: [0, 60],
                outputRange: [1, 0],
                extrapolate: 'clamp',
              }),
              transform: [{
                translateY: briefingScrollY.interpolate({
                  inputRange: [0, 60],
                  outputRange: [0, -10],
                  extrapolate: 'clamp',
                }),
              }],
            },
          ]}
          pointerEvents="none"
        >
          {activeLanguages.map((_, i) => (
            <View
              key={i}
              style={[
                styles.dot,
                {
                  backgroundColor: i === briefPageIndex ? colors.inkMid : colors.borderMid,
                  width: i === briefPageIndex ? 16 : 5,
                },
              ]}
            />
          ))}
        </Animated.View>
      )}
      <ScrollView
        ref={pagerRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={16}
        onMomentumScrollEnd={handlePageScroll}
        style={styles.pager}
        overScrollMode="never"
      >
        {activeLanguages.map((lang) => {
          const level = lang.level ?? 'B1';
          const length = resolveLength(level, (lang.readLength ?? 'longer') as ArticleLength);
          const stored = briefings[lang.code];
          const today = new Date().toISOString().split('T')[0];
          const briefingMatches =
            !!stored && stored.date === today && stored.level === level && stored.length === length;
          if (briefingMatches && stored) {
            lastValidBriefingsRef.current[lang.code] = stored;
          }
          const displayBriefing = briefingMatches
            ? stored
            : (lastValidBriefingsRef.current[lang.code] ?? undefined);
          const isTransitioning = !briefingMatches && !!lastValidBriefingsRef.current[lang.code];

          // All active cities, each translated into this page's language
          const cityLine = activeLanguages
            .map(l => CITY_IN_LANG[l.code]?.[lang.code] ?? LANG_CITY_NATIVE[l.code] ?? l.name)
            .join(' · ');
          const tagline = getTagline(lang.code, langCount);

          const { progress: scrollProgress, opacity: scrollOpacity } = getScrollIndicatorValues(lang.code);
          const pillColor = SCROLL_PILL_COLORS[background] ?? '#222222';
          const PILL_H = 40;
          const PILL_TRACK_TOP    = insets.top + 20;
          const PILL_TRACK_BOTTOM = winH - FLOAT_TAB_INSET - PILL_H - 20;
          const pillTranslateY = scrollProgress.interpolate({
            inputRange: [0, 1],
            outputRange: [0, PILL_TRACK_BOTTOM - PILL_TRACK_TOP],
            extrapolate: 'clamp',
          });

          return (
            <View key={lang.code} style={[styles.page, { width: winW }]}>
            <ScrollView
              ref={(el) => { if (el) langScrollRefs.current.set(lang.code, el); else langScrollRefs.current.delete(lang.code); }}
              style={{ flex: 1, backgroundColor: colors.bg }}
              contentContainerStyle={[
                styles.pageContent,
                { paddingTop: insets.top + 12, paddingBottom: 0 },
              ]}
              showsVerticalScrollIndicator={false}
              directionalLockEnabled
              scrollEventThrottle={16}
              onScroll={e => {
                const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
                const y = contentOffset.y;
                briefingScrollY.setValue(y);
                // Reveal-on-scroll-up: any upward movement reopens the pill
                // immediately (same pattern as Safari's URL bar), not just
                // reaching the very top — scrolling down past the threshold
                // collapses it again. Asymmetric threshold otherwise (only
                // re-expand right at the top on its own) still applies when
                // stationary or scrolling down, to avoid flicker right at
                // the collapse boundary.
                const scrollingUp = y < lastScrollYRef.current - 1;
                lastScrollYRef.current = y;
                const nowScrolled = scrollingUp
                  ? false
                  : scrolledFlagRef.current
                  ? y > PILL_TOP_EPS
                  : y > PILL_COLLAPSE_Y;
                if (nowScrolled !== scrolledFlagRef.current) {
                  scrolledFlagRef.current = nowScrolled;
                  setBriefingScrolled(nowScrolled);
                }
                if (contentSize.height > 0) {
                  const pct = (y + layoutMeasurement.height) / contentSize.height;
                  scrollPctRef.current[lang.code] = Math.max(scrollPctRef.current[lang.code] ?? 0, pct);
                  if (!scrollMetRef.current[lang.code] && pct >= 0.9) {
                    scrollMetRef.current[lang.code] = true;
                    maybeCredit(lang.code);
                  }
                }
                handleScrollIndicator(lang.code, y, contentSize.height, layoutMeasurement.height);
              }}
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={onRefresh}
                  tintColor={colors.inkLight}
                />
              }
            >
              <View style={styles.lockupWrap}>
                <Image
                  key={`masthead-${background}`}
                  source={MASTHEADS[background] ?? MASTHEADS.white}
                  style={[styles.lockup, { width: lockupW, height: lockupH }]}
                  resizeMode="contain"
                />
              </View>

              {/* Cities row */}
              <View style={styles.citiesWrap}>
                <Text style={[styles.cities, { color: chrome, fontFamily: fontFamily.regular }]}>
                  {cityLine}
                </Text>
              </View>

              {/* Medium rule between rows */}
              <View style={[styles.ruleOuterInset, { backgroundColor: hairline }]} />

              {/* Row 2: language·level (left) · streak (right) */}
              <View
                style={styles.editionRow}
                ref={editionRowRef}
                onLayout={() => {
                  if (weatherModalY > 0) return;
                  editionRowRef.current?.measure((_x, _y, _w, h, _px, py) => {
                    if (py > 0) setWeatherModalY(py + h + 6);
                  });
                }}
              >
                <TouchableOpacity
                  onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setLevelPickerLang(lang.code); }}
                  activeOpacity={0.6}
                  hitSlop={{ top: 8, bottom: 8, left: 4, right: 8 }}
                  style={styles.editionLabelRow}
                >
                  <Text style={[styles.editionLabel, { color: colors.inkMid, fontFamily: fontFamily.regular, fontSize: 15 }]}>
                    {lang.nativeName.toUpperCase()} · {level === 'Native'
                      ? `${nativeGradeByLang[lang.code as LanguageCode] ?? 'C1'} / ${NATIVE_WORD[lang.code] ?? 'Native'}`
                      : level}
                  </Text>
                  <Ionicons name="chevron-down" size={14} color={colors.inkFaint} style={{ marginLeft: 3, marginTop: 1 }} />
                </TouchableOpacity>
                {(() => {
                  const streak = readingStreaks[lang.code] ?? 0;
                  const isReadToday = lastReadDates[lang.code] === today;
                  const isFrozen = isFrozenToday(lang.code);
                  const streakColor = isReadToday ? '#F97316'
                                    : isFrozen   ? '#60A5FA'
                                    :               colors.inkFaint;
                  const calColor = colors.inkDark;
                  return (
                    <TouchableOpacity
                      ref={(r) => { if (r) streakButtonRefs.current[lang.code] = r; }}
                      onPress={() => { openStreakModal(lang.code); }}
                      activeOpacity={0.7}
                      hitSlop={{ top: 6, bottom: 6, left: 8, right: 8 }}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}
                    >
                      {streak === 0 ? (
                        <>
                          <Ionicons name="calendar-outline" size={17} color={calColor} />
                          <Text style={[styles.editionLabel, { color: calColor, fontFamily: fontFamily.regular, fontSize: 15 }]}>
                            {streak}
                          </Text>
                        </>
                      ) : isFrozen ? (
                        <>
                          <Text style={{ fontSize: 15 }}>❄️</Text>
                          <Text style={[styles.editionLabel, { color: streakColor, fontFamily: fontFamily.regular, fontSize: 15 }]}>
                            {streak}
                          </Text>
                        </>
                      ) : (
                        <>
                          <Ionicons name={isReadToday ? 'flame' : 'flame-outline'} size={17} color={streakColor} />
                          <Text style={[styles.editionLabel, { color: streakColor, fontFamily: fontFamily.regular, fontSize: 15 }]}>
                            {streak}
                          </Text>
                        </>
                      )}
                      <Ionicons name="chevron-down" size={14} color={streak === 0 ? calColor : streakColor} />
                    </TouchableOpacity>
                  );
                })()}
              </View>

              {/* ── Word count row ──────────────────────────────────────── */}
              {(() => {
                const wordsToday = getWordsToday(lang.code);
                const words7d    = getWordsLast7Days(lang.code);
                if (wordsToday === 0 && words7d === 0) return null;
                const fmt = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
                return (
                  <View style={styles.wordCountRow}>
                    <Text style={[styles.wordCountText, { color: colors.inkFaint, fontFamily: fontFamily.regular }]}>
                      {fmt(wordsToday)} words today
                    </Text>
                    <Text style={[styles.wordCountText, { color: colors.inkFaint, fontFamily: fontFamily.regular }]}>
                      ·
                    </Text>
                    <Text style={[styles.wordCountText, { color: colors.inkFaint, fontFamily: fontFamily.regular }]}>
                      {fmt(words7d)} this week
                    </Text>
                  </View>
                );
              })()}

              {/* ── Language content ────────────────────────────────────── */}
              <LanguageBriefingSection
                langCode={lang.code}
                nativeName={lang.nativeName}
                level={level}
                length={length}
                briefing={displayBriefing}
                isGenerating={generatingFor.includes(lang.code)}
                error={errorsFor[lang.code]}
                isFirst
                topics={topics}
                weather={(topics.weather ?? true) ? (weatherByLang[lang.code] ?? null) : null}
                weatherModalY={weatherModalY}
                isTransitioning={isTransitioning}
                hideEditionHeader
                bundleReceivedAt={bundleReceivedAt}
                onRetry={() => {
                  clearError(lang.code);
                  loadBriefing(lang.code, level, length, true);
                }}
                onVisibleWordCount={(count) => {
                  visibleWordCountRef.current[lang.code] = count;
                  // If streak already credited today, keep the stored count up-to-date
                  // as topics/level/length change. recordWordsRead ignores lower values,
                  // so removing topics never decreases the count.
                  if (readTrackedRef.current[lang.code]) {
                    recordWordsRead(lang.code, count);
                  }
                }}
              />

              {/* ── Page footer ─────────────────────────────────────────── */}
              {displayBriefing && (
                <View style={[styles.articleFooter, { paddingBottom: insets.bottom + FLOAT_TAB_BOTTOM }]}>
                  <View style={[styles.footerRule, { backgroundColor: chrome }]} />
                  <Text style={[styles.footerDate, { color: colors.inkFaint, fontFamily: fontFamily.italic }]}>
                    {publishedDateStr(bundleReceivedAt, lang.code)}
                  </Text>
                  <Text style={[styles.footerTagline, { color: colors.inkFaint, fontFamily: fontFamily.italic }]}>
                    {tagline}
                  </Text>
                  <TouchableOpacity
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                      setCelebration({ langCode: lang.code, streakCount: readingStreaks[lang.code] ?? 1 });
                      setConfettiActive(true);
                    }}
                    activeOpacity={0.75}
                    hitSlop={{ top: 14, bottom: 14, left: 20, right: 20 }}
                  >
                    <Image
                      source={CRESTS[background] ?? CRESTS.cream}
                      style={styles.footerCrest}
                      resizeMode="contain"
                    />
                  </TouchableOpacity>
                </View>
              )}
            </ScrollView>
            {/* Scroll position pill */}
            <Animated.View
              pointerEvents="none"
              style={[
                styles.scrollPill,
                {
                  backgroundColor: pillColor,
                  opacity: scrollOpacity,
                  top: PILL_TRACK_TOP,
                  transform: [{ translateY: pillTranslateY }],
                },
              ]}
            />
            </View>
          );
        })}
      </ScrollView>

      {/* Status-bar fade — semi-transparent so text faintly shows through, like Claude app */}
      <LinearGradient
        pointerEvents="none"
        colors={[colors.bg + 'CC', colors.bg + '55', colors.bg + '00'] as any}
        locations={[0, 0.65, 1]}
        style={[styles.statusFade, { height: insets.top + 28 }]}
      />

      {/* ── Level + Length picker — dropdown tile style (matches streak calendar) ── */}
      <Modal
        visible={levelPickerLang !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setLevelPickerLang(null)}
      >
        <BlurView intensity={10} tint={isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} pointerEvents="none" />
        <TouchableOpacity
          style={[styles.calendarBackdrop, { paddingTop: weatherModalY }]}
          activeOpacity={1}
          onPress={() => setLevelPickerLang(null)}
        >
          <TouchableOpacity activeOpacity={1}>

            {/* Top tile — same height/style as streak flags tile */}
            <View style={[styles.flagsTile, { backgroundColor: colors.card, borderColor: colors.borderLight, marginBottom: 8 }]}>
              <View style={styles.flagsTileClip}>
                <View style={[styles.flagsTileContent, { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52 }]}>
                  <FlagCircle code={(levelPickerLang ?? 'en') as LanguageCode} size={30} />
                  <Text style={[styles.calFlagLabel, { color: colors.inkDark, fontFamily: fontFamily.bold, flex: 1, fontSize: 17, letterSpacing: 0.1 }]}>
                    {activeLanguages.find(l => l.code === levelPickerLang)?.nativeName ?? ''} · Edition
                  </Text>
                </View>
              </View>
            </View>

            {/* Main tile — length + level, fixed minHeight to match streak calendar */}
            <View style={[styles.calendarCard, { backgroundColor: colors.card, borderColor: colors.borderLight, minHeight: 370 }]}>
              <View style={{ padding: 16 }}>

                {/* Length */}
                <Text style={[styles.pickerSectionLabel, { color: colors.inkFaint, fontFamily: fontFamily.regular }]}>
                  Length
                </Text>
                <View style={[styles.lengthToggleRow, { marginBottom: 20 }]}>
                  {(['short', 'longer'] as const).map((len) => {
                    const isActive = pickerLength === len;
                    return (
                      <TouchableOpacity
                        key={len}
                        style={[
                          styles.lengthChip,
                          { borderColor: isActive ? colors.inkDark : colors.borderMid },
                          isActive && {
                            backgroundColor: colors.inkDark,
                            shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
                            shadowOpacity: 0.18, shadowRadius: 4, elevation: 3,
                          },
                        ]}
                        onPress={() => {
                          Haptics.selectionAsync();
                          setPickerLength(len);
                          if (levelPickerLang) setLanguageReadLength(levelPickerLang as any, len);
                        }}
                        activeOpacity={0.7}
                      >
                        <Text style={[styles.lengthChipText, { color: isActive ? colors.bg : colors.inkDark, fontFamily: isActive ? fontFamily.bold : fontFamily.regular }]}>
                          {len === 'short'
                            ? (LENGTH_LABELS[levelPickerLang ?? '']?.[0] ?? 'Short')
                            : (LENGTH_LABELS[levelPickerLang ?? '']?.[1] ?? 'Long')}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* Level chips */}
                <Text style={[styles.pickerSectionLabel, { color: colors.inkFaint, fontFamily: fontFamily.regular }]}>
                  Level
                </Text>
                <View style={[styles.levelGrid, { paddingBottom: 4 }]}>
                  {(() => {
                    const lc = levelPickerLang as LanguageCode | null;
                    const perLength = (lc ? availableLevelsByLangAndLength[lc]?.[pickerLength] : undefined) ?? [];
                    const allForLang = (lc ? availableLevelsByLang[lc] : undefined) ?? [];
                    const base = perLength.length > 0 ? perLength : allForLang;
                    const nativeLevel = 'Native' as LanguageLevel;
                    const levels = allForLang.includes(nativeLevel) && !base.includes(nativeLevel)
                      ? [...base, nativeLevel]
                      : base;
                    return levels;
                  })().map((lvl) => {
                    const currentLevel = activeLanguages.find(l => l.code === levelPickerLang)?.level ?? 'B1';
                    const isActive = lvl === currentLevel;
                    const grade = nativeGradeByLang[levelPickerLang as LanguageCode];
                    const chipLabel = lvl === 'Native'
                      ? `${grade ?? 'C1'} / ${NATIVE_WORD[levelPickerLang ?? ''] ?? 'Native'}`
                      : lvl;
                    return (
                      <TouchableOpacity
                        key={lvl}
                        style={[
                          styles.levelChip,
                          { borderColor: isActive ? colors.inkDark : colors.borderMid },
                          isActive && {
                            backgroundColor: colors.inkDark,
                            shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
                            shadowOpacity: 0.18, shadowRadius: 4, elevation: 3,
                          },
                        ]}
                        onPress={() => {
                          Haptics.selectionAsync();
                          const lc = levelPickerLang;
                          if (lc) setLanguageLevel(lc as any, lvl);
                          setLevelPickerLang(null);
                        }}
                        activeOpacity={0.7}
                      >
                        <Text style={[
                          styles.levelChipText,
                          { color: isActive ? colors.bg : colors.inkMid, fontFamily: isActive ? fontFamily.bold : fontFamily.regular },
                        ]}>
                          {chipLabel}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <Text style={[styles.levelHint, { color: colors.inkFaint, fontFamily: fontFamily.italic }]}>
                  Your brief will reload at the selected edition.
                </Text>
              </View>
            </View>

          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      <Modal
        visible={streakModalVisible}
        transparent
        animationType="fade"
        onRequestClose={closeStreakModal}
      >
        <BlurView intensity={10} tint={isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} pointerEvents="none" />
        <TouchableOpacity
          style={[styles.calendarBackdrop, { paddingTop: streakAnchorY }]}
          activeOpacity={1}
          onPress={closeStreakModal}
        >
          <Animated.View style={{ transform: [{ translateY: calSlideAnim }], opacity: calOpacityAnim }}>
            {/* Language flags tile — only shown when there's more than one language */}
            {langsWithHistory.length > 1 && (
              <TouchableOpacity
                activeOpacity={1}
                style={[styles.flagsTile, { backgroundColor: colors.card, borderColor: colors.borderLight }]}
              >
                {/* Inner clip view — keeps shadow on parent while clipping chip highlights at border radius */}
                <View style={styles.flagsTileClip}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.flagsTileContent}>
                  <TouchableOpacity
                    style={[styles.calFlagChip, calModalActiveLang === 'all' && { backgroundColor: colors.inkDark }]}
                    onPress={() => setCalModalActiveLang('all')}
                    activeOpacity={0.7}
                  >
                    <GlobeCircle size={24} />
                    <Text style={[styles.calFlagLabel, { color: calModalActiveLang === 'all' ? colors.bg : colors.inkFaint, fontFamily: calModalActiveLang === 'all' ? fontFamily.bold : fontFamily.regular }]}>All</Text>
                  </TouchableOpacity>
                  {langsWithHistory.map(code => (
                    <TouchableOpacity
                      key={code}
                      style={[styles.calFlagChip, calModalActiveLang === code && { backgroundColor: colors.inkDark }]}
                      onPress={() => setCalModalActiveLang(code)}
                      activeOpacity={0.7}
                    >
                      <FlagCircle code={code} size={24} />
                      <Text style={[styles.calFlagLabel, { color: calModalActiveLang === code ? colors.bg : colors.inkFaint, fontFamily: calModalActiveLang === code ? fontFamily.bold : fontFamily.regular }]}>
                        {langDisplayCode(code)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
                </View>
              </TouchableOpacity>
            )}
            {langsWithHistory.length > 1 && <View style={{ height: 8 }} />}

            {/* Calendar tile */}
            <TouchableOpacity
              activeOpacity={1}
              style={[styles.calendarCard, { backgroundColor: colors.card, borderColor: colors.borderLight }]}
            >
              <FullStreakCalendar
                readingHistory={readingHistory}
                filterLang={streakModalLang}
                activeLang={calModalActiveLang}
                onLangChange={setCalModalActiveLang}
                freezeDatesUsed={freezeDatesUsed}
                readingStreaks={readingStreaks}
                hideTabs
                headerStyle="tile"
              />
            </TouchableOpacity>
          </Animated.View>
        </TouchableOpacity>
      </Modal>

      <StreakCelebrationModal
        visible={celebration !== null}
        streakCount={celebration?.streakCount ?? 1}
        langCode={celebration?.langCode ?? 'en'}
        wordsToday={celebration ? getWordsToday(celebration.langCode) : 0}
        streakTotal={(() => {
          if (!celebration) return 0;
          const { langCode: lc, streakCount: sc } = celebration;
          let total = 0;
          for (let i = 0; i < sc; i++) {
            const d = new Date(); d.setDate(d.getDate() - i);
            const key = `${lc}_${d.toISOString().split('T')[0]}`;
            total += wordsReadByDay[key] ?? 0;
          }
          return total;
        })()}
        onDismiss={() => {
          setCelebration(null);
          setConfettiActive(false);
          // After individual modal closes, check if this was the last language
          const activeCodes = activeLanguages.map(l => l.code);
          if (
            activeCodes.length >= 2 &&
            !fullSweepShownToday() &&
            allReadToday(activeCodes)
          ) {
            recordFullSweep();
            setFullSweepVisible(true);
            analytics.trackAllLanguagesRead(activeCodes.length);
          }
        }}
      />
      <FullSweepModal
        visible={fullSweepVisible}
        langCodes={activeLanguages.map(l => l.code)}
        onDismiss={() => setFullSweepVisible(false)}
      />
      <NewLanguageAnnouncementModal
        visible={showPtAnnouncement}
        onDismiss={markPtSeen}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  pager:     { flex: 1 },

  page:        { width: SCREEN_WIDTH },
  pageContent: {},

  ruleOuter: { height: 2, width: SCREEN_WIDTH },
  ruleInner: { height: 1, width: SCREEN_WIDTH, marginVertical: 2 },
  hairline:  { height: StyleSheet.hairlineWidth, width: SCREEN_WIDTH },
  ruleInset:      { height: 1, marginHorizontal: 8, marginVertical: 5, borderRadius: 1 },
  ruleOuterInset: { height: StyleSheet.hairlineWidth, marginHorizontal: 8, marginTop: 0, marginBottom: 12, borderRadius: 1 },

  citiesWrap: {
    alignSelf: 'stretch',
    alignItems: 'center',
  },
  cities: {
    width: '100%',
    textAlign: 'center',
    fontSize: 9,
    letterSpacing: 2.5,
    textTransform: 'uppercase',
    paddingTop: 0,
    paddingBottom: 12,
  },
  lockupWrap: {
    alignSelf: 'stretch',
    paddingHorizontal: LOCKUP_PADDING,
    paddingTop: 8,
    paddingBottom: 0,
    alignItems: 'center',
    overflow: 'hidden',
  },
  lockup: {
    width: LOCKUP_W,
    height: LOCKUP_H,
  },
  metaRow: {
    width: SCREEN_WIDTH,
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
  metaStreak: {
    fontSize: 11,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  editionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingTop: 0,
    paddingBottom: 8,
  },
  editionRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  editionLabel: {
    fontSize: 12,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  tagline: {
    fontSize: 13,
    fontStyle: 'italic',
    paddingRight: 4,
  },
  wordCountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 18,
    paddingBottom: 6,
  },
  wordCountText: {
    fontSize: 11,
    letterSpacing: 0.5,
  },

  fixedDots: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 5,
    zIndex: 10,
  },
  dot: {
    height: 5,
    borderRadius: 3,
  },

  articleFooter: {
    marginTop: 32,
    paddingHorizontal: 18,
    paddingBottom: 0,
    alignItems: 'center',
  },
  footerRule: {
    height: 1,
    width: '100%',
    opacity: 0.35,
  },
  footerDate: {
    marginTop: 14,
    fontSize: 11,
    opacity: 0.5,
    textAlign: 'center',
  },
  footerTagline: {
    marginTop: 6,
    fontSize: 13,
    opacity: 0.5,
    textAlign: 'center',
  },
  footerCrest: {
    marginTop: 12,
    width: 44,
    height: 44,
    opacity: 0.45,
  },
  statusFade: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  scrollPill: {
    position: 'absolute',
    right: 4,
    width: 4,
    height: 40,
    borderRadius: 2,
  },

  calendarBackdrop: {
    flex: 1,
    backgroundColor: 'transparent',
    justifyContent: 'flex-start',
    paddingHorizontal: 16,
  },
  calendarCard: {
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.13,
    shadowRadius: 6,
    elevation: 3,
  },
  flagsTile: {
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.13,
    shadowRadius: 6,
    elevation: 3,
  },
  flagsTileClip: {
    overflow: 'hidden',
    borderRadius: 19,
  },
  flagsTileContent: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  calFlagChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 20,
  },
  calFlagLabel: {
    fontSize: 13,
    letterSpacing: 0.2,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  modalTitle: {
    fontSize: 16,
    letterSpacing: 0.3,
  },

  pickerSectionLabel: {
    fontSize: 11,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 8,
    marginTop: 4,
    opacity: 0.6,
  },
  lengthToggleRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  lengthChip: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 100,
    borderWidth: 1,
    alignItems: 'center',
  },
  lengthChipText: {
    fontSize: 14,
    letterSpacing: 0.5,
  },

  levelGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 10,
    paddingBottom: 20,
  },
  levelChip: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 100,
    borderWidth: 1,
    minWidth: 72,
    alignItems: 'center',
  },
  levelChipText: {
    fontSize: 14,
    letterSpacing: 0.5,
  },
  levelHint: {
    fontSize: 12,
    opacity: 0.7,
    textAlign: 'center',
    paddingBottom: 4,
  },

  editionLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});
