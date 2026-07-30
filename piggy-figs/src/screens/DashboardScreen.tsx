import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../App';
import { DASHBOARD_HTML, DASHBOARD_JS } from '../dashboard/assets';
import { BILINGUIST_DASHBOARD_HTML, BILINGUIST_DASHBOARD_JS } from '../dashboard/bilinguistAssets';
import { getApiKey } from '../lib/connections';
import { fetchOverview, PostHogQueryError } from '../lib/posthog';
import { fetchBilinguistOverview } from '../lib/posthogBilinguist';
import { GlassButton } from '../components/GlassButton';
import { useTheme, SPACING, FONT_SERIF } from '../theme/tokens';

type Props = NativeStackScreenProps<RootStackParamList, 'Dashboard'>;

function buildHtml(html: string, js: string, initialData: unknown | null): string {
  // window.__EMBEDDED__ tells the Bilinguist dashboard's JS to hide its
  // in-page "Refresh now" button (which points at a web-only endpoint) in
  // favor of this screen's native refresh icon.
  const dataScript = `<script>window.__EMBEDDED__ = true; window.__INITIAL_DATA__ = ${JSON.stringify(initialData)};</script>`;
  const jsScript = `<script>${js}</script>`;
  return html.replace('</body>', `${dataScript}${jsScript}</body>`);
}

export function DashboardScreen({ route, navigation }: Props) {
  const { connection } = route.params;
  const isBilinguist = connection.kind === 'bilinguist';
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const webRef = useRef<WebView>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [html, setHtml] = useState<string>(() =>
    buildHtml(isBilinguist ? BILINGUIST_DASHBOARD_HTML : DASHBOARD_HTML, isBilinguist ? BILINGUIST_DASHBOARD_JS : DASHBOARD_JS, null)
  );
  const [loadedOnce, setLoadedOnce] = useState(false);
  const rangeDaysRef = useRef(30);

  const load = useCallback(async (days?: number) => {
    if (days != null) rangeDaysRef.current = days;
    setRefreshing(true);
    setError(null);
    try {
      const apiKey = await getApiKey(connection.id);
      if (!apiKey) throw new Error('No API key stored for this connection.');

      const data = isBilinguist
        ? await fetchBilinguistOverview(connection, apiKey, (done, total) => setProgress(`Fetching ${done}/${total}…`))
        : await fetchOverview(connection, apiKey, rangeDaysRef.current);

      const [thisHtml, thisJs] = isBilinguist ? [BILINGUIST_DASHBOARD_HTML, BILINGUIST_DASHBOARD_JS] : [DASHBOARD_HTML, DASHBOARD_JS];
      if (loadedOnce && webRef.current) {
        webRef.current.injectJavaScript(`window.__setData__(${JSON.stringify(data)}); true;`);
      } else {
        setHtml(buildHtml(thisHtml, thisJs, data));
      }
      setLoadedOnce(true);
    } catch (e: any) {
      setError(e instanceof PostHogQueryError ? e.message : e?.message ?? 'Failed to load data');
    } finally {
      setLoading(false);
      setRefreshing(false);
      setProgress(null);
    }
  }, [connection, loadedOnce, isBilinguist]);

  // The generic dashboard's timeframe buttons live inside the WebView and
  // have no direct way to call back into React Native other than
  // postMessage — this is the other half of that bridge.
  const handleWebViewMessage = useCallback((e: WebViewMessageEvent) => {
    try {
      const msg = JSON.parse(e.nativeEvent.data);
      if (msg?.type === 'setRange' && typeof msg.days === 'number') {
        load(msg.days);
      }
    } catch {
      // Not a message we understand — ignore.
    }
  }, [load]);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    navigation.setOptions({ title: connection.name });
  }, [navigation, connection.name]);

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <View style={[styles.header, { paddingTop: insets.top + 8, borderBottomColor: colors.border }]}>
        <Text style={[styles.title, { color: colors.ink }]}>{connection.name}</Text>
        <GlassButton tintColor={colors.chrome} style={styles.refreshBtn} onPress={() => load()} disabled={refreshing}>
          <View style={styles.refreshBtnInner}>
            {refreshing ? <ActivityIndicator size="small" color={colors.ink} /> : <Ionicons name="refresh" size={20} color={colors.ink} />}
          </View>
        </GlassButton>
      </View>

      {error && (
        <View style={[styles.notice, { backgroundColor: colors.accentRed + '22' }]}>
          <Text style={[styles.noticeText, { color: colors.accentRed }]}>{error}</Text>
        </View>
      )}

      {loading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator color={colors.accentRed} />
          <Text style={[styles.loadingText, { color: colors.inkMid }]}>{progress ?? 'Loading from PostHog…'}</Text>
          {isBilinguist && (
            <Text style={[styles.loadingSubtext, { color: colors.inkFaint }]}>Bilinguist Brief's dashboard pulls 15 separate event queries — first load can take a few seconds.</Text>
          )}
        </View>
      ) : (
        <WebView
          ref={webRef}
          source={{ html }}
          style={{ flex: 1, backgroundColor: colors.bg }}
          originWhitelist={['*']}
          onMessage={handleWebViewMessage}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg, paddingBottom: SPACING.md, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  title: { fontFamily: FONT_SERIF, fontSize: 20, fontWeight: '700' },
  refreshBtn: { borderRadius: 999 },
  refreshBtnInner: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  notice: { paddingHorizontal: SPACING.lg, paddingVertical: 10 },
  noticeText: { fontSize: 12.5 },
  loadingBox: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 40 },
  loadingText: { fontSize: 13 },
  loadingSubtext: { fontSize: 11.5, textAlign: 'center', lineHeight: 16 },
});
