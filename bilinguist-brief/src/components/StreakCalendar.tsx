import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
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
  filterLang: string | 'all';
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
  // Monday-first offset: getDay() returns 0=Sun, so (0+6)%7=6 for Sunday, (1+6)%7=0 for Monday
  const firstDayOfWeek = (new Date(year, month, 1).getDay() + 6) % 7;
  const monthLabel = `${MONTH_NAMES[month]} ${year}`;

  // Build grid cells: leading empty + day numbers
  const cells: Array<{ day: number | null }> = [];
  for (let i = 0; i < firstDayOfWeek; i++) cells.push({ day: null });
  for (let d = 1; d <= daysInMonth; d++) cells.push({ day: d });
  // Pad to complete the last row
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
      {/* Day headers */}
      <View style={calStyles.headerRow}>
        {DAY_HEADERS.map((h, i) => (
          <View key={i} style={calStyles.headerCell}>
            <Text style={[calStyles.headerText, { color: colors.inkFaint, fontFamily: fontFamily.regular }]}>
              {h}
            </Text>
          </View>
        ))}
      </View>
      {/* Calendar rows */}
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
                {isFrozen && (
                  <Text style={calStyles.freezeIcon}>❄</Text>
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
  const year = now.getFullYear();
  const month = now.getMonth();

  const dayLanguages = buildDayLanguages(readingHistory, 'all');

  return (
    <MonthCalendar
      year={year}
      month={month}
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

  const dayLanguages = buildDayLanguages(readingHistory, filterLang);
  const frozenDays = buildFrozenDays(freezeDatesUsed, filterLang);

  const now = new Date();
  const months: Array<{ year: number; month: number }> = [];
  for (let i = 0; i <= 6; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({ year: d.getFullYear(), month: d.getMonth() });
  }

  return (
    <ScrollView showsVerticalScrollIndicator={false}>
      {months.map(({ year, month }) => (
        <MonthCalendar
          key={`${year}-${month}`}
          year={year}
          month={month}
          dayLanguages={dayLanguages}
          frozenDays={frozenDays}
          activeLanguageCodes={activeLanguageCodes}
          colors={colors}
          fontFamily={fontFamily}
        />
      ))}
    </ScrollView>
  );
}

const calStyles = StyleSheet.create({
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
  freezeIcon: {
    fontSize: 8,
    color: FREEZE_BLUE,
    marginTop: 1,
    textAlign: 'center',
  },
});
