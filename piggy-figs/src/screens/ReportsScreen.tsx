import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, ActivityIndicator, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../App';
import {
  syncReports, listLocalDates, loadLocalReport, type PipelineReport, type LevelReport,
} from '../lib/reports';
import { GlassButton } from '../components/GlassButton';
import { useTheme, SPACING, RADIUS, LABEL_STYLE, FONT_SERIF } from '../theme/tokens';

type Props = NativeStackScreenProps<RootStackParamList, 'Reports'>;

const STATUS_COLOR = { ok: '#0ca30c', gaps: '#c98500', failed: '#d03b3b' } as const;
const LEVEL_STATUS_COLOR = { ok: '#0ca30c', under: '#c98500', over: '#c98500', missing: '#d03b3b' } as const;

export function ReportsScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const [dates, setDates] = useState<string[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [report, setReport] = useState<PipelineReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    navigation.setOptions({ title: 'Pipeline Reports' });
  }, [navigation]);

  const loadDate = useCallback(async (date: string) => {
    const r = await loadLocalReport(date);
    setReport(r);
    setSelectedDate(date);
  }, []);

  const refresh = useCallback(async () => {
    setSyncing(true);
    setError(null);
    try {
      const { latest } = await syncReports((msg) => setProgress(msg));
      const localDates = await listLocalDates();
      setDates(localDates);
      await loadDate(latest.date);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to sync reports');
    } finally {
      setSyncing(false);
      setProgress(null);
      setLoading(false);
    }
  }, [loadDate]);

  useEffect(() => {
    (async () => {
      const localDates = await listLocalDates();
      setDates(localDates);
      if (localDates.length > 0) {
        await loadDate(localDates[0]);
        setLoading(false);
      }
      // Always try a live sync too — this either confirms we have the
      // latest, or backfills/updates in the background.
      refresh();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function exportReport() {
    if (!report) return;
    try {
      const path = `${FileSystem.cacheDirectory}report_${report.date}.json`;
      await FileSystem.writeAsStringAsync(path, JSON.stringify(report, null, 2));
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(path, { mimeType: 'application/json', dialogTitle: `Report ${report.date}` });
      } else {
        Alert.alert('Sharing unavailable', 'This device cannot open the share sheet.');
      }
    } catch (e: any) {
      Alert.alert('Export failed', e?.message ?? 'Could not export this report.');
    }
  }

  async function exportAll() {
    try {
      const all: PipelineReport[] = [];
      for (const date of dates) {
        const r = await loadLocalReport(date);
        if (r) all.push(r);
      }
      const path = `${FileSystem.cacheDirectory}bilinguist-reports-all.json`;
      await FileSystem.writeAsStringAsync(path, JSON.stringify(all, null, 2));
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(path, { mimeType: 'application/json', dialogTitle: `${all.length} reports` });
      } else {
        Alert.alert('Sharing unavailable', 'This device cannot open the share sheet.');
      }
    } catch (e: any) {
      Alert.alert('Export failed', e?.message ?? 'Could not export reports.');
    }
  }

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator color={colors.accentRed} />
        <Text style={{ color: colors.inkMid, marginTop: 10, fontSize: 13 }}>{progress ?? 'Loading reports…'}</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <View style={[styles.header, { paddingTop: insets.top + 8, borderBottomColor: colors.border }]}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.headerTitle, { color: colors.ink }]}>Pipeline Reports</Text>
          {dates.length > 0 && <Text style={{ color: colors.inkFaint, fontSize: 11 }}>{dates.length} run{dates.length === 1 ? '' : 's'} stored on device</Text>}
        </View>
        <GlassButton tintColor={colors.chrome} style={styles.iconBtn} onPress={refresh} disabled={syncing}>
          <View style={styles.iconBtnInner}>
            {syncing ? <ActivityIndicator size="small" color={colors.ink} /> : <Ionicons name="refresh" size={18} color={colors.ink} />}
          </View>
        </GlassButton>
      </View>

      {error && (
        <View style={[styles.notice, { backgroundColor: colors.accentRed + '22' }]}>
          <Text style={{ color: colors.accentRed, fontSize: 12.5 }}>{error}</Text>
        </View>
      )}

      {dates.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.dateRow} contentContainerStyle={{ gap: SPACING.sm, paddingHorizontal: SPACING.lg }}>
          {dates.map((d) => (
            <GlassButton key={d} active={d === selectedDate} tintColor={colors.chrome} style={styles.dateChip} onPress={() => loadDate(d)}>
              <Text style={{ fontSize: 12, color: d === selectedDate ? colors.bg : colors.inkMid, fontWeight: d === selectedDate ? '700' : '400' }}>{d}</Text>
            </GlassButton>
          ))}
        </ScrollView>
      )}

      {!report ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: SPACING.xl }}>
          <Text style={{ color: colors.inkFaint, fontSize: 13, textAlign: 'center' }}>
            No reports yet. Tap refresh once the pipeline has run.
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: SPACING.lg, paddingBottom: insets.bottom + SPACING.xl }}>
          {/* Headline */}
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: SPACING.sm }}>
              <Text style={[styles.dateTitle, { color: colors.ink }]}>{report.date}</Text>
              <View style={[styles.statusPill, { backgroundColor: STATUS_COLOR[report.status] + '22' }]}>
                <Text style={{ color: STATUS_COLOR[report.status], fontSize: 11, fontWeight: '700', textTransform: 'uppercase' }}>{report.status}</Text>
              </View>
            </View>
            <Text style={{ color: colors.inkMid, fontSize: 13 }}>
              Coverage {report.coverage.present}/{report.coverage.total} ({(report.coverage.ratio * 100).toFixed(0)}%)
              {'  ·  '}{report.published ? 'Published' : 'NOT published'}
              {'  ·  '}{(report.durationMs / 1000).toFixed(0)}s
            </Text>
          </View>

          {/* Word-count grid */}
          <SectionLabel colors={colors}>Word counts</SectionLabel>
          {report.languages.map((lang) => (
            <View key={lang.lang} style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.langTitle, { color: colors.ink }]}>{lang.name} <Text style={{ color: colors.inkFaint, fontSize: 11, fontFamily: undefined }}>· native {lang.nativeGrade}</Text></Text>
              <View style={styles.levelGrid}>
                {lang.levels.map((lvl: LevelReport) => (
                  <View key={lvl.level + lvl.length} style={[styles.levelCell, { borderColor: LEVEL_STATUS_COLOR[lvl.status] }]}>
                    <Text style={{ fontSize: 10.5, color: colors.inkFaint, fontWeight: '700' }}>{lvl.level} · {lvl.length}</Text>
                    <Text style={{ fontSize: 15, color: LEVEL_STATUS_COLOR[lvl.status], fontWeight: '700' }}>{lvl.avgWords}w</Text>
                    <Text style={{ fontSize: 10, color: colors.inkFaint }}>target {lvl.target[0]}–{lvl.target[1]}</Text>
                  </View>
                ))}
              </View>
            </View>
          ))}

          {/* Problems */}
          {(report.missing.length > 0 || report.warnings.length > 0) && (
            <>
              <SectionLabel colors={colors}>Problems</SectionLabel>
              <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                {report.missing.map((m) => (
                  <Text key={m} style={{ color: '#d03b3b', fontSize: 12.5, marginBottom: 4 }}>✕ {m}</Text>
                ))}
                {report.warnings.map((w) => (
                  <Text key={w} style={{ color: '#c98500', fontSize: 12.5, marginBottom: 4 }}>⚠ {w}</Text>
                ))}
              </View>
            </>
          )}

          {/* Cost */}
          <SectionLabel colors={colors}>Cost</SectionLabel>
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={{ color: colors.ink, fontSize: 18, fontFamily: FONT_SERIF, fontWeight: '700', marginBottom: SPACING.sm }}>
              £{report.cost.totalGbp.toFixed(4)} <Text style={{ color: colors.inkFaint, fontSize: 12, fontFamily: undefined }}>(${report.cost.totalUsd.toFixed(4)})</Text>
            </Text>
            {Object.entries(report.cost.stages).map(([stage, s]) => (
              <View key={stage} style={styles.costRow}>
                <Text style={{ color: colors.inkMid, fontSize: 12, flex: 1 }}>{stage} <Text style={{ color: colors.inkFaint }}>({s.model})</Text></Text>
                <Text style={{ color: colors.ink, fontSize: 12, fontVariant: ['tabular-nums'] }}>£{s.costGbp.toFixed(4)}</Text>
              </View>
            ))}
          </View>

          {/* Story scores */}
          {report.scores.length > 0 && (
            <>
              <SectionLabel colors={colors}>Global News scores</SectionLabel>
              <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                {report.scores.map((s) => (
                  <View key={s.slug} style={styles.scoreRow}>
                    <Text style={{ color: colors.inkFaint, fontSize: 12, width: 24 }}>#{s.rank}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: colors.ink, fontSize: 12.5 }} numberOfLines={2}>{s.headline}</Text>
                      <Text style={{ color: colors.inkFaint, fontSize: 10.5, marginTop: 2 }}>{s.outlets.join(', ')}</Text>
                    </View>
                    <Text style={{ color: colors.inkMid, fontSize: 12, fontVariant: ['tabular-nums'] }}>{s.score}/{s.max}</Text>
                  </View>
                ))}
              </View>
            </>
          )}

          {/* Fact-check */}
          <SectionLabel colors={colors}>Fact-check</SectionLabel>
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={{ color: colors.inkMid, fontSize: 13 }}>
              {report.factcheck.stories} stories checked · {report.factcheck.corrections} correction{report.factcheck.corrections === 1 ? '' : 's'} applied
            </Text>
          </View>

          {/* Export */}
          <View style={{ flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.md }}>
            <GlassButton active tintColor={colors.chrome} style={{ flex: 1, borderRadius: RADIUS.input }} onPress={exportReport}>
              <View style={styles.exportBtnInner}>
                <Text style={{ color: colors.bg, fontWeight: '700', fontSize: 13 }}>Export this report</Text>
              </View>
            </GlassButton>
            <GlassButton tintColor={colors.chrome} style={{ flex: 1, borderRadius: RADIUS.input }} onPress={exportAll}>
              <View style={styles.exportBtnInner}>
                <Text style={{ color: colors.ink, fontWeight: '700', fontSize: 13 }}>Export all ({dates.length})</Text>
              </View>
            </GlassButton>
          </View>
        </ScrollView>
      )}
    </View>
  );
}

function SectionLabel({ colors, children }: { colors: ReturnType<typeof useTheme>['colors']; children: React.ReactNode }) {
  return <Text style={[styles.sectionLabel, { color: colors.inkFaint, borderTopColor: colors.border }]}>{children}</Text>;
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg, paddingBottom: SPACING.md, borderBottomWidth: StyleSheet.hairlineWidth, gap: SPACING.sm,
  },
  headerTitle: { fontFamily: FONT_SERIF, fontSize: 20, fontWeight: '700' },
  iconBtn: { borderRadius: 999 },
  iconBtnInner: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  notice: { paddingHorizontal: SPACING.lg, paddingVertical: 10 },
  dateRow: { paddingVertical: SPACING.sm, flexGrow: 0 },
  dateChip: { borderRadius: RADIUS.pill, paddingHorizontal: 12, paddingVertical: 6 },
  sectionLabel: { ...LABEL_STYLE, borderTopWidth: 1, paddingTop: SPACING.sm, marginTop: SPACING.md, marginBottom: SPACING.sm },
  card: { borderRadius: RADIUS.card, borderWidth: StyleSheet.hairlineWidth, padding: SPACING.md },
  dateTitle: { fontFamily: FONT_SERIF, fontSize: 18, fontWeight: '700' },
  statusPill: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: RADIUS.tag },
  langTitle: { fontFamily: FONT_SERIF, fontSize: 15, fontWeight: '700', marginBottom: SPACING.sm },
  levelGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  levelCell: { borderWidth: 1, borderRadius: RADIUS.input, padding: SPACING.sm, minWidth: 92, alignItems: 'center' },
  costRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  scoreRow: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.sm, paddingVertical: 6 },
  exportBtnInner: { paddingVertical: 12, alignItems: 'center' },
});
