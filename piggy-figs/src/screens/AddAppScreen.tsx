import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView,
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../App';
import { addConnection, type DashboardKind } from '../lib/connections';
import { testConnection } from '../lib/posthog';

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
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 40 }]}>
        <Text style={styles.title}>Add a PostHog app</Text>
        <Text style={styles.subtitle}>
          Uses a PostHog Personal API Key (read scopes: Event, Query) — not the public write key
          your app uses to send events. Create one in PostHog → Settings → Personal API Keys.
        </Text>

        <Field label="App name">
          <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="e.g. Bilinguist Brief" placeholderTextColor="#666" />
        </Field>

        <Field label="PostHog Project ID">
          <TextInput style={styles.input} value={projectId} onChangeText={setProjectId} placeholder="e.g. 208705" placeholderTextColor="#666" keyboardType="number-pad" />
        </Field>

        <Field label="Region">
          <View style={styles.row}>
            {HOST_PRESETS.map((p) => (
              <TouchableOpacity
                key={p.value}
                style={[styles.chip, host === p.value && !customHost && styles.chipActive]}
                onPress={() => { setHost(p.value); setCustomHost(false); }}
              >
                <Text style={[styles.chipText, host === p.value && !customHost && styles.chipTextActive]}>{p.label}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              style={[styles.chip, customHost && styles.chipActive]}
              onPress={() => setCustomHost(true)}
            >
              <Text style={[styles.chipText, customHost && styles.chipTextActive]}>Custom</Text>
            </TouchableOpacity>
          </View>
          {customHost && (
            <TextInput
              style={[styles.input, { marginTop: 8 }]}
              value={host}
              onChangeText={setHost}
              placeholder="https://your-posthog-instance.com"
              placeholderTextColor="#666"
              autoCapitalize="none"
            />
          )}
        </Field>

        <Field label="Dashboard type">
          <View style={{ gap: 8 }}>
            {DASHBOARD_KINDS.map((k) => (
              <TouchableOpacity
                key={k.value}
                style={[styles.kindOption, kind === k.value && styles.kindOptionActive]}
                onPress={() => setKind(k.value)}
              >
                <Text style={[styles.kindLabel, kind === k.value && styles.chipTextActive]}>{k.label}</Text>
                <Text style={styles.kindDescription}>{k.description}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </Field>

        <Field label="Personal API Key">
          <TextInput
            style={styles.input}
            value={apiKey}
            onChangeText={setApiKey}
            placeholder="phx_..."
            placeholderTextColor="#666"
            autoCapitalize="none"
            secureTextEntry
          />
        </Field>

        <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={testing}>
          {testing ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>Test & Save</Text>}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ marginBottom: 18 }}>
      <Text style={styles.label}>{label}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0d0d0d' },
  scroll: { paddingHorizontal: 20 },
  title: { fontSize: 22, fontWeight: '700', color: '#fff', marginBottom: 6 },
  subtitle: { fontSize: 12.5, color: '#898781', marginBottom: 24, lineHeight: 18 },
  label: { fontSize: 12, fontWeight: '600', color: '#c3c2b7', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.4 },
  input: {
    backgroundColor: '#1a1a19', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, color: '#fff', fontSize: 15,
  },
  row: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  chip: {
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999,
    backgroundColor: '#1a1a19', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
  },
  chipActive: { borderColor: '#3987e5', backgroundColor: 'rgba(57,135,229,0.15)' },
  chipText: { color: '#c3c2b7', fontSize: 13 },
  chipTextActive: { color: '#fff', fontWeight: '600' },
  kindOption: {
    padding: 12, borderRadius: 10, backgroundColor: '#1a1a19',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
  },
  kindOptionActive: { borderColor: '#3987e5', backgroundColor: 'rgba(57,135,229,0.1)' },
  kindLabel: { color: '#c3c2b7', fontSize: 14, fontWeight: '600', marginBottom: 3 },
  kindDescription: { color: '#898781', fontSize: 11.5, lineHeight: 16 },
  saveBtn: {
    backgroundColor: '#3987e5', borderRadius: 10, paddingVertical: 14,
    alignItems: 'center', marginTop: 10,
  },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
