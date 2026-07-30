import React, { useCallback, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, RefreshControl, ScrollView,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../hooks/useTheme';
import { DASHBOARD_HTML, DASHBOARD_JS } from './generatedAssets';
import { EMPTY_ANALYTICS_DATA } from './emptyData';

// Set these once the corresponding bilinguist-worker routes exist — see
// posthog-dashboard/HANDOVER.md. Until then the screen falls back to the
// bundled empty state and tells the admin viewing it why.
const DATA_URL = process.env.EXPO_PUBLIC_ANALYTICS_DATA_URL ?? '';
const REFRESH_URL = process.env.EXPO_PUBLIC_ANALYTICS_REFRESH_URL ?? '';

function buildHtml(initialData: unknown): string {
  const dataScript = `<script>window.__INITIAL_DATA__ = ${JSON.stringify(initialData)};${
    REFRESH_URL ? `window.__REFRESH_ENDPOINT__ = ${JSON.stringify(REFRESH_URL)};` : ''
  }</script>`;
  const jsScript = `<script>${DASHBOARD_JS}</script>`;
  return DASHBOARD_HTML.replace('</body>', `${dataScript}${jsScript}</body>`);
}

interface Props {
  onClose: () => void;
}

export function AnalyticsScreen({ onClose }: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const webRef = useRef<WebView>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(DATA_URL ? null : 'not-configured');
  const [html, setHtml] = useState(() => buildHtml(EMPTY_ANALYTICS_DATA));
  const [loadedOnce, setLoadedOnce] = useState(false);

  const fetchLiveData = useCallback(async () => {
    if (!DATA_URL) return;
    setRefreshing(true);
    setError(null);
    try {
      const res = await fetch(DATA_URL);
      if (!res.ok) throw new Error(`${res.status}`);
      const data = await res.json();
      if (loadedOnce && webRef.current) {
        // Cheap live update without a full WebView reload.
        webRef.current.injectJavaScript(`window.__setData__(${JSON.stringify(data)}); true;`);
      } else {
        setHtml(buildHtml(data));
      }
      setLoadedOnce(true);
    } catch (e: any) {
      setError(e?.message ?? 'fetch-failed');
    } finally {
      setRefreshing(false);
    }
  }, [loadedOnce]);

  React.useEffect(() => {
    fetchLiveData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <View style={[styles.header, { paddingTop: insets.top + 8, borderBottomColor: colors.borderLight }]}>
        <Text style={[styles.title, { color: colors.inkDark }]}>Analytics</Text>
        <View style={{ flexDirection: 'row', gap: 14 }}>
          <TouchableOpacity onPress={fetchLiveData} disabled={refreshing}>
            {refreshing ? (
              <ActivityIndicator size="small" color={colors.inkDark} />
            ) : (
              <Ionicons name="refresh" size={22} color={colors.inkDark} />
            )}
          </TouchableOpacity>
          <TouchableOpacity onPress={onClose}>
            <Ionicons name="close" size={24} color={colors.inkDark} />
          </TouchableOpacity>
        </View>
      </View>

      {!DATA_URL && (
        <View style={[styles.notice, { borderBottomColor: colors.borderLight }]}>
          <Text style={[styles.noticeText, { color: colors.inkFaint }]}>
            EXPO_PUBLIC_ANALYTICS_DATA_URL isn't set, so this is showing an empty placeholder.
            Point it at the bilinguist-worker analytics-data endpoint once that route exists
            (see posthog-dashboard/HANDOVER.md) to see live PostHog data here.
          </Text>
        </View>
      )}
      {error && error !== 'not-configured' && (
        <View style={[styles.notice, { borderBottomColor: colors.borderLight }]}>
          <Text style={[styles.noticeText, { color: '#d03b3b' }]}>
            Couldn't load live data ({error}). Showing last-known data.
          </Text>
        </View>
      )}

      <WebView
        ref={webRef}
        source={{ html }}
        style={{ flex: 1 }}
        originWhitelist={['*']}
        onError={(e) => setError(e.nativeEvent.description ?? 'webview-error')}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 18, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  title: { fontSize: 20, fontWeight: '700' },
  notice: { paddingHorizontal: 18, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  noticeText: { fontSize: 12.5, lineHeight: 17 },
});
