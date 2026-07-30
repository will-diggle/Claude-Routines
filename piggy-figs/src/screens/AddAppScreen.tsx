import React, { useState } from 'react';
import {
  View, Text, TextInput, StyleSheet, ScrollView,
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../App';
import { addConnection, type DashboardKind } from '../lib/connections';
import { testConnection } from '../lib/posthog';
import { GlassButton } from '../components/GlassButton';
import { useTheme, SPACING, RADIUS, LABEL_STYLE, FONT_SERIF } from '../theme/tokens';

type Props = NativeStackScreenProps<RootStackParamList, 'AddApp'>;

const HOST_PRESETS = [
  { label: 'EU Cloud', value: 'https://eu.posthog.com' },
  { label: 'US Cloud', value: 'https://us.posthog.com' },
];

const DASHBOARD_KINDS: { label: string; value: DashboardKind; description: string }[] = [
  { label: 'Generic', value: 'generic', description: 'Unique users, events, sessions, top events & pages — works for any PostHog project.' },
  { label: 'Bilinguist Brief', value: 'bilinguist', description: 'Language & CEFR-level filters, funnels, streaks — built for Bilinguist Brief’s specific events.' },
];

export function AddAppScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const [name, setName] = useState('');
  const [projectId, setProjectId] = useState('');
  const [host, setHost] = useState(HOST_PRESETS[0].value);
  const [customHost, setCustomHost] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [kind, setKind] = useState<DashboardKind>('generic');
  const [testing, setTesting] = useState(false);

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
      await testConnection({ id: 'test', name, projectId, host, kind }, apiKey);
    } catch (e: any) {
      setTesting(false);
      Alert.alert(
        "Couldn't connect",
        `PostHog rejected this project ID / host / key combination:\n\n${e?.message ?? 'Unknown error'}`
      );
      return;
    }
    try {
      await addConnection({ name, projectId, host, apiKey, kind });
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
        <Text style={[styles.title, { color: colors.ink }]}>Add a PostHog app</Text>
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
          <View style={styles.row}>
            {HOST_PRESETS.map((p) => (
              <GlassButton
                key={p.value}
                active={host === p.value && !customHost}
                tintColor={colors.chrome}
                style={styles.chip}
                onPress={() => { setHost(p.value); setCustomHost(false); }}
              >
                <Text style={[styles.chipText, { color: colors.inkMid }, host === p.value && !customHost && { color: colors.bg, fontWeight: '600' }]}>{p.label}</Text>
              </GlassButton>
            ))}
            <GlassButton active={customHost} tintColor={colors.chrome} style={styles.chip} onPress={() => setCustomHost(true)}>
              <Text style={[styles.chipText, { color: colors.inkMid }, customHost && { color: colors.bg, fontWeight: '600' }]}>Custom</Text>
            </GlassButton>
          </View>
          {customHost && (
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
          <View style={{ gap: SPACING.sm }}>
            {DASHBOARD_KINDS.map((k) => (
              <GlassButton
                key={k.value}
                active={kind === k.value}
                tintColor={colors.chrome}
                style={styles.kindOption}
                onPress={() => setKind(k.value)}
              >
                <View style={styles.kindOptionInner}>
                  <Text style={[styles.kindLabel, { color: colors.inkMid }, kind === k.value && { color: colors.bg }]}>{k.label}</Text>
                  <Text style={[styles.kindDescription, { color: kind === k.value ? colors.bg : colors.inkFaint, opacity: kind === k.value ? 0.8 : 1 }]}>{k.description}</Text>
                </View>
              </GlassButton>
            ))}
          </View>
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
        </Field>

        <GlassButton active tintColor={colors.accentRed} style={styles.saveBtn} onPress={handleSave} disabled={testing}>
          <View style={styles.saveBtnInner}>
            {testing ? <ActivityIndicator color={colors.bg} /> : <Text style={[styles.saveBtnText, { color: colors.bg }]}>Test & Save</Text>}
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
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: RADIUS.input, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15,
  },
  row: { flexDirection: 'row', gap: SPACING.sm, flexWrap: 'wrap' },
  chip: { borderRadius: RADIUS.pill, paddingHorizontal: 12, paddingVertical: 8 },
  chipText: { fontSize: 13 },
  kindOption: { borderRadius: RADIUS.card },
  kindOptionInner: { padding: SPACING.md },
  kindLabel: { fontFamily: FONT_SERIF, fontSize: 14, fontWeight: '700', marginBottom: 3 },
  kindDescription: { fontSize: 11.5, lineHeight: 16 },
  saveBtn: { borderRadius: RADIUS.input, marginTop: SPACING.sm },
  saveBtnInner: { paddingVertical: 14, alignItems: 'center' },
  saveBtnText: { fontWeight: '700', fontSize: 15 },
});
