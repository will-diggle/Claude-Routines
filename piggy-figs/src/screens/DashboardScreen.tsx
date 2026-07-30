import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../App';
import { DASHBOARD_HTML, DASHBOARD_JS } from '../dashboard/assets';
import { getApiKey } from '../lib/connections';
import { fetchOverview, PostHogQueryError } from '../lib/posthog';

type Props = NativeStackScreenProps<RootStackParamList, 'Dashboard'>;

function buildHtml(initialData: unknown | null): string {
  const dataScript = `<script>window.__INITIAL_DATA__ = ${JSON.stringify(initialData)};</script>`;
  const jsScript = `<script>${DASHBOARD_JS}</script>`;
  return DASHBOARD_HTML.replace('</body>', `${dataScript}${jsScript}</body>`);
}

export function DashboardScreen({ route, navigation }: Props) {
  const { connection } = route.params;
  const insets = useSafeAreaInsets();
  const webRef = useRef<WebView>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [html, setHtml] = useState<string>(() => buildHtml(null));
  const [loadedOnce, setLoadedOnce] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    try {
      const apiKey = await getApiKey(connection.id);
      if (!apiKey) throw new Error('No API key stored for this connection.');
      const data = await fetchOverview(connection, apiKey);
      if (loadedOnce && webRef.current) {
        webRef.current.injectJavaScript(`window.__setData__(${JSON.stringify(data)}); true;`);
      } else {
        setHtml(buildHtml(data));
      }
      setLoadedOnce(true);
    } catch (e: any) {
      setError(e instanceof PostHogQueryError ? e.message : e?.message ?? 'Failed to load data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [connection, loadedOnce]);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    navigation.setOptions({ title: connection.name });
  }, [navigation, connection.name]);

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Text style={styles.title}>{connection.name}</Text>
        <TouchableOpacity onPress={load} disabled={refreshing}>
          {refreshing ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="refresh" size={22} color="#fff" />}
        </TouchableOpacity>
      </View>

      {error && (
        <View style={styles.notice}>
          <Text style={styles.noticeText}>{error}</Text>
        </View>
      )}

      {loading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator color="#3987e5" />
          <Text style={styles.loadingText}>Loading from PostHog…</Text>
        </View>
      ) : (
        <WebView
          ref={webRef}
          source={{ html }}
          style={{ flex: 1, backgroundColor: '#0d0d0d' }}
          originWhitelist={['*']}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0d0d0d' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 18, paddingBottom: 12,
  },
  title: { fontSize: 20, fontWeight: '700', color: '#fff' },
  notice: { paddingHorizontal: 18, paddingVertical: 10, backgroundColor: '#2a1414' },
  noticeText: { fontSize: 12.5, color: '#e66767' },
  loadingBox: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  loadingText: { color: '#898781', fontSize: 13 },
});
