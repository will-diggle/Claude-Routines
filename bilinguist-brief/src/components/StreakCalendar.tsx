import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useShallow } from 'zustand/react/shallow';
import { useTheme } from '../hooks/useTheme';
import { useSettingsStore } from '../store/useSettingsStore';
import { Spacing } from '../theme';
import { FlagCircle } from './FlagCircle';

interface Props {
  readingHistory: Record<string, string[]>; // langCode → ['YYYY-MM-DD', ...]
}

interface FullCalendarProps {
  readingHistory: Record<string, string[]>;
  filterLang: string | 'all'; // initial tab selection
  freezeDatesUsed?: Record<string, string[]>;
}

const FREEZE_BLUE = '#4A90C4';

const DAY_HEADERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

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
}

function MonthCalendar({ year, month, dayLanguages, frozenDays, activeLanguageCodes, colors, fontFamily }: MonthCalendarProps) {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayOfWeek = (new Date(year, month, 1).getDay() + 6) % 7;
  const monthLabel = `${MONTH_NAMES[month]} ${year}`;

  const cells: Array<{ day: number | null }> = [];
  for (let i = 0; i < firstDayOfWeek; i++) cells.push({ day: null });
  for (let d = 1; d <= daysInMonth; d++) cells.push({ day: d });
  while (cells.length % 7 !== 0) cells.push({ day: null });

  const rows: Array<Array<{ day: number | null }>> = [];
  for (let i = 0; i < cells.length; i += 7) {
    rows.push(cells.slice(i, i + 7));
  }

  return (
    <View style={calStyles.monthContainer}>
      <Text style={[calStyles.monthTitle, { color: colors.inkDark, fontFamily: fontFamily.bold }]}>
        {monthLabel}
      </Text>
      <View style={calStyles.headerRow}>
        {DAY_HEADERS.map((h, i) => (
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
            const displayFlags = flags.slice(0, 4);

            return (
              <View key={colIdx} style={calStyles.cell}>
                <View
                  style={[
                    calStyles.circle,
                    isRead
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
                        color: isRead ? colors.bg : isFrozen ? '#fff' : colors.inkLight,
                        fontFamily: (isRead || isFrozen) ? fontFamily.bold : fontFamily.regular,
                      },
                    ]}
                  >
                    {cell.day}
                  </Text>
                </View>
                {/* Freeze icon — same container size as FlagCircle size={14} */}
                {isFrozen && (
                  <View style={calStyles.freezeIconWrap}>
                    <Text style={calStyles.freezeIcon}>❄</Text>
                  </View>
                )}
                {displayFlags.length > 0 && (
                  <View style={calStyles.flagRow}>
                    {displayFlags.map((langCode, fi) => (
                      <FlagCircle key={fi} code={langCode} size={14} />
                    ))}
                  </View>
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

export function FullStreakCalendar({ readingHistory, filterLang, freezeDatesUsed = {} }: FullCalendarProps) {
  const { colors, fontFamily } = useTheme();
  const activeLanguageCodes = useSettingsStore(
    useShallow((s) => s.languages.filter((l) => l.active).map((l) => l.code)),
  );

  // Internal tab state — starts on the lang whose streak was tapped
  const [activeLang, setActiveLang] = useState<string>(filterLang);

  // Languages that have at least one reading history entry
  const langsWithHistory = useMemo(
    () => Object.keys(readingHistory).filter((code) => readingHistory[code].length > 0),
    [readingHistory],
  );

  const dayLanguages = buildDayLanguages(readingHistory, activeLang);
  const frozenDays = buildFrozenDays(freezeDatesUsed, activeLang);

  const now = new Date();

  return (
    <View>
      {/* Language filter tab bar */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={calStyles.tabBar}
        contentContainerStyle={calStyles.tabBarContent}
      >
        {/* ALL tab */}
        <TouchableOpacity
          onPress={() => setActiveLang('all')}
          style={calStyles.langTab}
          activeOpacity={0.7}
        >
          <View style={calStyles.allTabCircle}>
            <Text style={[calStyles.allTabText, { color: activeLang === 'all' ? colors.inkDark : colors.inkFaint, fontFamily: fontFamily.bold }]}>
              ∗
            </Text>
          </View>
          <Text
            style={[
              calStyles.langTabLabel,
              {
                color: activeLang === 'all' ? colors.inkDark : colors.inkFaint,
                fontFamily: activeLang === 'all' ? fontFamily.bold : fontFamily.regular,
                textDecorationLine: activeLang === 'all' ? 'underline' : 'none',
              },
            ]}
          >
            All
          </Text>
        </TouchableOpacity>

        {langsWithHistory.map((code) => (
          <TouchableOpacity
            key={code}
            onPress={() => setActiveLang(code)}
            style={calStyles.langTab}
            activeOpacity={0.7}
          >
            <FlagCircle code={code} size={22} />
            <Text
              style={[
                calStyles.langTabLabel,
                {
                  color: activeLang === code ? colors.inkDark : colors.inkFaint,
                  fontFamily: activeLang === code ? fontFamily.bold : fontFamily.regular,
                  textDecorationLine: activeLang === code ? 'underline' : 'none',
                },
              ]}
            >
              {code.toUpperCase()}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Single month — no scroll */}
      <MonthCalendar
        year={now.getFullYear()}
        month={now.getMonth()}
        dayLanguages={dayLanguages}
        frozenDays={frozenDays}
        activeLanguageCodes={activeLanguageCodes}
        colors={colors}
        fontFamily={fontFamily}
      />
    </View>
  );
}

const calStyles = StyleSheet.create({
  // ── Tab bar ──────────────────────────────────────────────────────────────────
  tabBar: {
    marginBottom: 12,
  },
  tabBarContent: {
    paddingHorizontal: Spacing.md,
    gap: 4,
    flexDirection: 'row',
    alignItems: 'center',
  },
  langTab: {
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    gap: 4,
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

  // ── Calendar ─────────────────────────────────────────────────────────────────
  monthContainer: {
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.lg,
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
    flexWrap: 'wrap',
    justifyContent: 'center',
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
