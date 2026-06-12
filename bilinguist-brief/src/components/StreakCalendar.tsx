import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useTheme } from '../hooks/useTheme';
import { Spacing } from '../theme';
import { useSettingsStore } from '../store/useSettingsStore';
import { useShallow } from 'zustand/react/shallow';

interface Props {
  readingHistory: Record<string, string[]>; // langCode → ['YYYY-MM-DD', ...]
}

interface FullCalendarProps {
  readingHistory: Record<string, string[]>;
  filterLang: string | 'all';
}

const DAY_HEADERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function buildDayLanguages(
  readingHistory: Record<string, string[]>,
  filterLang: string | 'all',
  flagMap: Record<string, string>,
): Record<string, string[]> {
  // date string → array of flags for that day
  const dayFlags: Record<string, string[]> = {};
  for (const [langCode, dates] of Object.entries(readingHistory)) {
    if (filterLang !== 'all' && langCode !== filterLang) continue;
    const flag = flagMap[langCode];
    if (!flag) continue;
    for (const date of dates) {
      if (!dayFlags[date]) dayFlags[date] = [];
      if (!dayFlags[date].includes(flag)) dayFlags[date].push(flag);
    }
  }
  return dayFlags;
}

interface MonthCalendarProps {
  year: number;
  month: number; // 0-indexed
  dayLanguages: Record<string, string[]>; // 'YYYY-MM-DD' → flags[]
  colors: any;
  fontFamily: any;
}

function MonthCalendar({ year, month, dayLanguages, colors, fontFamily }: MonthCalendarProps) {
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
            const displayFlags = flags.slice(0, 4);

            return (
              <View key={colIdx} style={calStyles.cell}>
                <View
                  style={[
                    calStyles.circle,
                    isRead
                      ? { backgroundColor: colors.chrome }
                      : { backgroundColor: 'transparent' },
                  ]}
                >
                  <Text
                    style={[
                      calStyles.dayText,
                      {
                        color: isRead ? colors.bg : colors.inkLight,
                        fontFamily: isRead ? fontFamily.bold : fontFamily.regular,
                      },
                    ]}
                  >
                    {cell.day}
                  </Text>
                </View>
                {displayFlags.length > 0 && (
                  <View style={calStyles.flagRow}>
                    {displayFlags.map((flag, fi) => (
                      <Text key={fi} style={calStyles.flagText}>
                        {flag}
                      </Text>
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
  const languages = useSettingsStore(useShallow((s) => s.languages));

  const flagMap: Record<string, string> = {};
  for (const lang of languages) {
    flagMap[lang.code] = lang.flag;
  }

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();

  const dayLanguages = buildDayLanguages(readingHistory, 'all', flagMap);

  return (
    <MonthCalendar
      year={year}
      month={month}
      dayLanguages={dayLanguages}
      colors={colors}
      fontFamily={fontFamily}
    />
  );
}

export function FullStreakCalendar({ readingHistory, filterLang }: FullCalendarProps) {
  const { colors, fontFamily } = useTheme();
  const languages = useSettingsStore(useShallow((s) => s.languages));

  const flagMap: Record<string, string> = {};
  for (const lang of languages) {
    flagMap[lang.code] = lang.flag;
  }

  const dayLanguages = buildDayLanguages(readingHistory, filterLang, flagMap);

  // Build list of the last 6 months + current month, newest first
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
    minHeight: 56,
    alignItems: 'center',
    paddingVertical: Spacing.xs,
  },
  circle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayText: {
    fontSize: 13,
  },
  flagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    marginTop: 2,
  },
  flagText: {
    fontSize: 11,
  },
});
