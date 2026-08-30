import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useShallow } from 'zustand/react/shallow';
import { useTheme } from '../hooks/useTheme';
import { useSettingsStore } from '../store/useSettingsStore';
import { Spacing } from '../theme';
import { FlagCircle, GlobeCircle } from './FlagCircle';
import { langDisplayCode } from '../store/useSettingsStore';

interface Props {
  readingHistory: Record<string, string[]>; // langCode → ['YYYY-MM-DD', ...]
}

interface FullCalendarProps {
  readingHistory: Record<string, string[]>;
  filterLang: string | 'all'; // initial tab selection
  freezeDatesUsed?: Record<string, string[]>;
  readingStreaks?: Record<string, number>;
  // Controlled lang (overrides internal state when provided)
  activeLang?: string;
  onLangChange?: (lang: string) => void;
  hideTabs?: boolean;
  headerStyle?: 'tile' | 'subtle';
  hideStreakLabel?: boolean;
}

const FREEZE_BLUE = '#4A90C4';

const DAY_HEADERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const DAY_HEADERS_AR = ['ن', 'ث', 'ر', 'خ', 'ج', 'س', 'ح'];

function toEasternArabic(n: number): string {
  return String(n).replace(/\d/g, d => '٠١٢٣٤٥٦٧٨٩'[+d]);
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function computeAllStreak(readingHistory: Record<string, string[]>): number {
  const allDates = new Set<string>();
  for (const dates of Object.values(readingHistory)) {
    for (const d of dates) allDates.add(d);
  }
  const sorted = [...allDates].sort().reverse();
  if (sorted.length === 0) return 0;

  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];
  const yest = new Date(now.getTime() - 86400000).toISOString().split('T')[0];
  if (sorted[0] !== todayStr && sorted[0] !== yest) return 0;

  let streak = 0;
  const start = new Date(sorted[0]);
  for (const dateStr of sorted) {
    const expected = new Date(start.getTime() - streak * 86400000);
    const expectedStr = expected.toISOString().split('T')[0];
    if (dateStr === expectedStr) {
      streak++;
    } else {
      break;
    }
  }
  return streak;
}

function buildDayLanguages(
  readingHistory: Record<string, string[]>,
  filterLang: string | 'all',
): Record<string, string[]> {
  const dayLangs: Record<string, string[]> = {};
  for (const [langCode, dates] of Object.entries(readingHistory)) {
    if (filterLang !== 'all' && langCode !== filterLang) continue;
    for (const date of dates) {
      if (!dayLangs[date]) dayLangs[date] = [];
      if (!dayLangs[date].includes(langCode)) dayLangs[date].push(langCode);
    }
  }
  return dayLangs;
}

function buildFrozenDays(
  freezeDatesUsed: Record<string, string[]>,
  filterLang: string | 'all',
): Set<string> {
  const frozen = new Set<string>();
  for (const [langCode, dates] of Object.entries(freezeDatesUsed)) {
    if (filterLang !== 'all' && langCode !== filterLang) continue;
    for (const date of dates) frozen.add(date);
  }
  return frozen;
}

interface MonthCalendarProps {
  year: number;
  month: number; // 0-indexed
  dayLanguages: Record<string, string[]>; // 'YYYY-MM-DD' → flags[]
  frozenDays?: Set<string>;
  activeLanguageCodes: string[];
  colors: any;
  fontFamily: any;
  useArabic?: boolean;
  hideTitle?: boolean;
}

function MonthCalendar({ year, month, dayLanguages, frozenDays, activeLanguageCodes, colors, fontFamily, useArabic, hideTitle }: MonthCalendarProps) {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayOfWeek = (new Date(year, month, 1).getDay() + 6) % 7;
  const monthLabel = `${MONTH_NAMES[month]} ${year}`;
  const todayStr = new Date().toISOString().split('T')[0];

  const cells: Array<{ day: number | null }> = [];
  for (let i = 0; i < firstDayOfWeek; i++) cells.push({ day: null });
  for (let d = 1; d <= daysInMonth; d++) cells.push({ day: d });
  while (cells.length % 7 !== 0) cells.push({ day: null });

  const rows: Array<Array<{ day: number | null }>> = [];
  for (let i = 0; i < cells.length; i += 7) {
    rows.push(cells.slice(i, i + 7));
  }

  const headers = useArabic ? DAY_HEADERS_AR : DAY_HEADERS;
  const fmt = (n: number) => useArabic ? toEasternArabic(n) : String(n);

  return (
    <View style={calStyles.monthContainer}>
      {!hideTitle && (
        <Text style={[calStyles.monthTitle, { color: colors.inkDark, fontFamily: fontFamily.bold }]}>
          {monthLabel}
        </Text>
      )}
      <View style={calStyles.headerRow}>
        {headers.map((h, i) => (
          <View key={i} style={calStyles.headerCell}>
            <Text style={[calStyles.headerText, { color: colors.inkFaint, fontFamily: fontFamily.regular }]}>
              {h}
            </Text>
          </View>
        ))}
      </View>
      {rows.map((row, rowIdx) => (
        <View key={rowIdx} style={calStyles.gridRow}>
          {row.map((cell, colIdx) => {
            if (cell.day === null) {
              return <View key={colIdx} style={calStyles.cell} />;
            }
            const mm = String(month + 1).padStart(2, '0');
            const dd = String(cell.day).padStart(2, '0');
            const dateStr = `${year}-${mm}-${dd}`;
            const flags = dayLanguages[dateStr] ?? [];
            const isRead = flags.length > 0;
            const isFrozen = !isRead && (frozenDays?.has(dateStr) ?? false);
            const isToday = dateStr === todayStr;
            const displayFlags = flags.slice(0, 4);

            return (
              <View key={colIdx} style={calStyles.cell}>
                <View
                  style={[
                    calStyles.circle,
                    isToday
                      ? { backgroundColor: colors.accentRed }
                      : isRead
                      ? { backgroundColor: colors.chrome }
                      : isFrozen
                      ? { backgroundColor: FREEZE_BLUE }
                      : { backgroundColor: 'transparent' },
                  ]}
                >
                  <Text
                    style={[
                      calStyles.dayText,
                      {
                        color: isToday ? '#fff' : isRead ? colors.bg : isFrozen ? '#fff' : colors.inkLight,
                        fontFamily: (isToday || isRead || isFrozen) ? fontFamily.bold : fontFamily.regular,
                      },
                    ]}
                  >
                    {fmt(cell.day)}
                  </Text>
                </View>
                {isFrozen && (
                  <View style={calStyles.freezeIconWrap}>
                    <Text style={calStyles.freezeIcon}>❄️</Text>
                  </View>
                )}
                {displayFlags.length > 0 && (
                  displayFlags.length === 4 ? (
                    <View style={calStyles.flagGrid}>
                      <View style={calStyles.flagRow}>
                        {displayFlags.slice(0, 2).map((langCode, fi) => (
                          <FlagCircle key={fi} code={langCode} size={14} />
                        ))}
                      </View>
                      <View style={calStyles.flagRow}>
                        {displayFlags.slice(2, 4).map((langCode, fi) => (
                          <FlagCircle key={fi + 2} code={langCode} size={14} />
                        ))}
                      </View>
                    </View>
                  ) : (
                    <View style={[calStyles.flagRow, { marginTop: 2 }]}>
                      {displayFlags.map((langCode, fi) => (
                        <FlagCircle key={fi} code={langCode} size={14} />
                      ))}
                    </View>
                  )
                )}
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}

export function StreakCalendar({ readingHistory }: Props) {
  const { colors, fontFamily } = useTheme();
  const activeLanguageCodes = useSettingsStore(
    useShallow((s) => s.languages.filter((l) => l.active).map((l) => l.code)),
  );

  const now = new Date();
  const dayLanguages = buildDayLanguages(readingHistory, 'all');

  return (
    <MonthCalendar
      year={now.getFullYear()}
      month={now.getMonth()}
      dayLanguages={dayLanguages}
      activeLanguageCodes={activeLanguageCodes}
      colors={colors}
      fontFamily={fontFamily}
    />
  );
}

export function FullStreakCalendar({
  readingHistory, filterLang, freezeDatesUsed = {}, readingStreaks = {},
  activeLang: externalActiveLang, onLangChange, hideTabs, headerStyle = 'subtle', hideStreakLabel,
}: FullCalendarProps) {
  const { colors, fontFamily } = useTheme();
  const activeLanguageCodes = useSettingsStore(
    useShallow((s) => s.languages.filter((l) => l.active).map((l) => l.code)),
  );

  const [internalActiveLang, setInternalActiveLang] = useState<string>(filterLang);
  const activeLang = externalActiveLang ?? internalActiveLang;
  function selectLang(lang: string) {
    setInternalActiveLang(lang);
    onLangChange?.(lang);
  }
  // 0 = current month, negative = past months
  const [monthOffset, setMonthOffset] = useState(0);

  const langsWithHistory = useMemo(
    () => Object.keys(readingHistory).filter((code) => readingHistory[code].length > 0),
    [readingHistory],
  );

  const dayLanguages = buildDayLanguages(readingHistory, activeLang);
  const frozenDays = buildFrozenDays(freezeDatesUsed, activeLang);

  const now = new Date();
  const displayDate = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
  const displayYear = displayDate.getFullYear();
  const displayMonth = displayDate.getMonth();

  const isCurrentMonth = monthOffset === 0;
  const canGoBack = monthOffset > -12;

  const currentStreak = useMemo(() => {
    if (activeLang === 'all') return computeAllStreak(readingHistory);
    return readingStreaks[activeLang] ?? 0;
  }, [activeLang, readingHistory, readingStreaks]);

  const streakLabel = currentStreak === 0
    ? 'No streak yet'
    : currentStreak === 1
    ? '1 day streak'
    : `${currentStreak} day streak`;

  return (
    <View>
      {/* Language filter tab bar — only shown when not hidden */}
      {!hideTabs && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={calStyles.tabBar}
          contentContainerStyle={calStyles.tabBarContent}
        >
          <TouchableOpacity onPress={() => selectLang('all')} style={calStyles.langTab} activeOpacity={0.7}>
            <GlobeCircle size={18} />
            <Text style={[calStyles.langTabLabel, {
              color: activeLang === 'all' ? colors.inkDark : colors.inkFaint,
              fontFamily: activeLang === 'all' ? fontFamily.bold : fontFamily.regular,
              textDecorationLine: activeLang === 'all' ? 'underline' : 'none',
            }]}>
              All
            </Text>
          </TouchableOpacity>
          {langsWithHistory.map((code) => (
            <TouchableOpacity key={code} onPress={() => selectLang(code)} style={calStyles.langTab} activeOpacity={0.7}>
              <FlagCircle code={code} size={18} />
              <Text style={[calStyles.langTabLabel, {
                color: activeLang === code ? colors.inkDark : colors.inkFaint,
                fontFamily: activeLang === code ? fontFamily.bold : fontFamily.regular,
                textDecorationLine: activeLang === code ? 'underline' : 'none',
              }]}>
                {langDisplayCode(code)}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {/* Tile-style header (profile tile style) */}
      {headerStyle === 'tile' && (
        <View style={calStyles.streakTileHeader}>
          <View style={calStyles.streakTileLeft}>
            <Text style={[calStyles.streakTileCount, { color: colors.inkDark, fontFamily: fontFamily.bold }]}>
              {currentStreak}
            </Text>
            <Text style={[calStyles.streakTileDays, { color: colors.inkFaint, fontFamily: fontFamily.regular }]}>
              {currentStreak === 1 ? 'day' : 'days'}
            </Text>
          </View>
          <Text style={[calStyles.streakTileTitle, { color: colors.inkDark, fontFamily: fontFamily.bold }]}>
            Daily Streaks
          </Text>
          <View style={{ flex: 1 }} />
        </View>
      )}

      {/* Subtle streak label */}
      {headerStyle !== 'tile' && !hideStreakLabel && (
        <Text style={[calStyles.streakSubtitle, {
          color: currentStreak > 0 ? colors.accentRed : colors.inkFaint,
          fontFamily: currentStreak > 0 ? fontFamily.bold : fontFamily.regular,
        }]}>
          {streakLabel}
        </Text>
      )}

      {/* Month navigation row */}
      <View style={calStyles.monthNav}>
        <TouchableOpacity
          onPress={() => setMonthOffset(o => o - 1)}
          disabled={!canGoBack}
          style={calStyles.navArrow}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="chevron-back" size={20} color={canGoBack ? colors.inkDark : colors.inkFaint} />
        </TouchableOpacity>

        <Text style={[calStyles.monthNavTitle, { color: colors.inkDark, fontFamily: fontFamily.bold }]}>
          {MONTH_NAMES[displayMonth]} {displayYear}
        </Text>

        <TouchableOpacity
          onPress={() => setMonthOffset(o => Math.min(0, o + 1))}
          disabled={isCurrentMonth}
          style={calStyles.navArrow}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons
            name="chevron-forward"
            size={20}
            color={isCurrentMonth ? 'transparent' : colors.inkDark}
          />
        </TouchableOpacity>
      </View>

      {/* Single month calendar */}
      <MonthCalendar
        year={displayYear}
        month={displayMonth}
        dayLanguages={dayLanguages}
        frozenDays={frozenDays}
        activeLanguageCodes={activeLanguageCodes}
        colors={colors}
        fontFamily={fontFamily}
        useArabic={activeLang === 'ar'}
        hideTitle
      />
    </View>
  );
}

const calStyles = StyleSheet.create({
  // ── Tab bar ──────────────────────────────────────────────────────────────────
  tabBar: {
    marginBottom: 0,
  },
  tabBarContent: {
    paddingHorizontal: Spacing.md,
    paddingTop: 2,
    paddingBottom: 2,
    gap: 2,
    flexDirection: 'row',
    alignItems: 'center',
  },
  langTab: {
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 2,
    gap: 2,
  },
  allTabCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: '#999',
    alignItems: 'center',
    justifyContent: 'center',
  },
  allTabText: {
    fontSize: 13,
    lineHeight: 16,
  },
  langTabLabel: {
    fontSize: 11,
    letterSpacing: 0.3,
  },

  streakSubtitle: {
    fontSize: 20,
    letterSpacing: 0.2,
    textAlign: 'center',
    paddingHorizontal: Spacing.md,
    paddingTop: 4,
    paddingBottom: 2,
  },

  // Tile-style header (matches profile page Daily Streaks tile)
  streakTileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  streakTileLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 4,
  },
  streakTileCount: {
    fontSize: 18,
  },
  streakTileDays: {
    fontSize: 12,
    marginBottom: 2,
  },
  streakTileTitle: {
    fontSize: 20,
  },

  // ── Month navigation ─────────────────────────────────────────────────────────
  monthNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: 4,
  },
  navArrow: {
    width: 32,
    alignItems: 'center',
  },
  monthNavTitle: {
    fontSize: 16,
    letterSpacing: 0.3,
  },

  // ── Calendar ─────────────────────────────────────────────────────────────────
  monthContainer: {
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  monthTitle: {
    fontSize: 16,
    marginBottom: Spacing.sm,
  },
  headerRow: {
    flexDirection: 'row',
    marginBottom: Spacing.xs,
  },
  headerCell: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: Spacing.xs,
  },
  headerText: {
    fontSize: 12,
  },
  gridRow: {
    flexDirection: 'row',
  },
  cell: {
    flex: 1,
    minHeight: 46,
    alignItems: 'center',
    paddingVertical: 2,
  },
  circle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayText: {
    fontSize: 12,
  },
  flagRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 1,
  },
  flagGrid: {
    alignItems: 'center',
    marginTop: 2,
    gap: 1,
  },
  freezeIconWrap: {
    width: 14,
    height: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  freezeIcon: {
    fontSize: 10,
    color: FREEZE_BLUE,
    textAlign: 'center',
  },
});
