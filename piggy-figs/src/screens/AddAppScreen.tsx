import React, { useEffect, useState } from 'react';
import {
  View, Text, TextInput, StyleSheet, ScrollView,
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../App';
import { addConnection, updateConnection, getApiKey, type DashboardKind } from '../lib/connections';
import { testConnection } from '../lib/posthog';
import { GlassButton } from '../components/GlassButton';
import { SegmentedControl } from '../components/SegmentedControl';
import { useTheme, SPACING, RADIUS, LABEL_STYLE, FONT_SERIF } from '../theme/tokens';

type Props = NativeStackScreenProps<RootStackParamList, 'AddApp'>;

type RegionMode = 'eu' | 'us' | 'custom';

const HOST_PRESETS: Record<Exclude<RegionMode, 'custom'>, string> = {
  eu: 'https://eu.posthog.com',
  us: 'https://us.posthog.com',
};

const REGION_OPTIONS: { label: string; value: RegionMode }[] = [
  { label: 'EU Cloud', value: 'eu' },
  { label: 'US Cloud', value: 'us' },
  { label: 'Custom', value: 'custom' },
];

const DASHBOARD_KINDS: { label: string; value: DashboardKind; description: string }[] = [
  { label: 'Generic', value: 'generic', description: 'Unique users, events, sessions, top events & pages — works for any PostHog project.' },
  { label: 'Bilinguist Brief', value: 'bilinguist', description: 'Language & CEFR-level filters, funnels, streaks — built for Bilinguist Brief’s specific events.' },
];

export function AddAppScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const editing = route.params?.editing;

  const initialRegion: RegionMode =
    editing?.host === HOST_PRESETS.eu ? 'eu' : editing?.host === HOST_PRESETS.us ? 'us' : editing ? 'custom' : 'eu';

  const [name, setName] = useState(editing?.name ?? '');
  const [projectId, setProjectId] = useState(editing?.projectId ?? '');
  const [regionMode, setRegionMode] = useState<RegionMode>(initialRegion);
  const [host, setHost] = useState(editing?.host ?? HOST_PRESETS.eu);
  const [apiKey, setApiKey] = useState('');
  const [kind, setKind] = useState<DashboardKind>(editing?.kind ?? 'generic');
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    navigation.setOptions({ title: editing ? 'Edit app' : 'Add app' });
  }, [navigation, editing]);

  // Pre-fill the API key field with the existing stored key so "Test & Save"
  // works immediately without retyping it — the user only needs to change
  // this field if they're actually rotating the key.
  useEffect(() => {
    if (editing) {
      getApiKey(editing.id).then((key) => { if (key) setApiKey(key); });
    }
  }, [editing]);

  async function handleSave() {
    if (!name.trim() || !projectId.trim() || !host.trim() || !apiKey.trim()) {
      Alert.alert('Missing info', 'Fill in every field — app name, project ID, host, and API key.');
      return;
    }
    setTesting(true);
    try {
      // Verify the credentials actually work before saving, so a typo
      // doesn't silently create a dead tile on the home screen. Deliberately
      // a cheap single query, not the full (generic or Bilinguist) fetch.
      await testConnection({ id: editing?.id ?? 'test', name, projectId, host, kind }, apiKey);
    } catch (e: any) {
      setTesting(false);
      Alert.alert(
        "Couldn't connect",
        `PostHog rejected this project ID / host / key combination:\n\n${e?.message ?? 'Unknown error'}`
      );
      return;
    }
    try {
      if (editing) {
        await updateConnection(editing.id, { name, projectId, host, kind, apiKey });
      } else {
        await addConnection({ name, projectId, host, apiKey, kind });
      }
      setTesting(false);
      navigation.goBack();
    } catch (e: any) {
      setTesting(false);
      Alert.alert('Save failed', e?.message ?? 'Could not save this connection.');
    }
  }

  return (
    <KeyboardAvoidingView style={[styles.container, { backgroundColor: colors.bg }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 40 }]}>
        <Text style={[styles.title, { color: colors.ink }]}>{editing ? 'Edit app' : 'Add a PostHog app'}</Text>
        <Text style={[styles.subtitle, { color: colors.inkMid }]}>
          Uses a PostHog Personal API Key (read scopes: Event, Query) — not the public write key
          your app uses to send events. Create one in PostHog → Settings → Personal API Keys.
        </Text>

        <Field label="App name" colors={colors}>
          <TextInput
            style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.ink }]}
            value={name} onChangeText={setName} placeholder="e.g. Bilinguist Brief" placeholderTextColor={colors.inkFaint}
          />
        </Field>

        <Field label="PostHog Project ID" colors={colors}>
          <TextInput
            style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.ink }]}
            value={projectId} onChangeText={setProjectId} placeholder="e.g. 208705" placeholderTextColor={colors.inkFaint} keyboardType="number-pad"
          />
        </Field>

        <Field label="Region" colors={colors}>
          <SegmentedControl
            options={REGION_OPTIONS}
            value={regionMode}
            onChange={(mode) => {
              setRegionMode(mode);
              if (mode !== 'custom') setHost(HOST_PRESETS[mode]);
            }}
          />
          {regionMode === 'custom' && (
            <TextInput
              style={[styles.input, { marginTop: 8, backgroundColor: colors.surface, borderColor: colors.border, color: colors.ink }]}
              value={host}
              onChangeText={setHost}
              placeholder="https://your-posthog-instance.com"
              placeholderTextColor={colors.inkFaint}
              autoCapitalize="none"
            />
          )}
        </Field>

        <Field label="Dashboard type" colors={colors}>
          <SegmentedControl
            options={DASHBOARD_KINDS.map(({ label, value }) => ({ label, value }))}
            value={kind}
            onChange={setKind}
          />
          <Text style={[styles.kindDescription, { color: colors.inkFaint, marginTop: SPACING.sm }]}>
            {DASHBOARD_KINDS.find((k) => k.value === kind)?.description}
          </Text>
        </Field>

        <Field label="Personal API Key" colors={colors}>
          <TextInput
            style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.ink }]}
            value={apiKey}
            onChangeText={setApiKey}
            placeholder="phx_..."
            placeholderTextColor={colors.inkFaint}
            autoCapitalize="none"
            secureTextEntry
          />
          {editing && (
            <Text style={[styles.hint, { color: colors.inkFaint }]}>Pre-filled with the saved key — only change this if you're rotating it.</Text>
          )}
        </Field>

        <GlassButton active tintColor={colors.accentRed} style={styles.saveBtn} onPress={handleSave} disabled={testing}>
          <View style={styles.saveBtnInner}>
            {testing ? <ActivityIndicator color={colors.bg} /> : <Text style={[styles.saveBtnText, { color: colors.bg }]}>{editing ? 'Test & Save Changes' : 'Test & Save'}</Text>}
          </View>
        </GlassButton>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Field({ label, colors, children }: { label: string; colors: ReturnType<typeof useTheme>['colors']; children: React.ReactNode }) {
  return (
    <View style={{ marginBottom: SPACING.lg }}>
      <Text style={[styles.label, { color: colors.inkFaint }]}>{label}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { paddingHorizontal: SPACING.lg },
  title: { fontFamily: FONT_SERIF, fontSize: 24, fontWeight: '700', marginBottom: SPACING.sm },
  subtitle: { fontSize: 12.5, marginBottom: SPACING.lg, lineHeight: 18 },
  label: { ...LABEL_STYLE, marginBottom: SPACING.sm },
  hint: { fontSize: 11, marginTop: 6, lineHeight: 15 },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: RADIUS.input, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15,
  },
  kindDescription: { fontSize: 11.5, lineHeight: 16 },
  saveBtn: { borderRadius: RADIUS.input, marginTop: SPACING.sm },
  saveBtnInner: { paddingVertical: 14, alignItems: 'center' },
  saveBtnText: { fontWeight: '700', fontSize: 15 },
});
