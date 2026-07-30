// Storage for the PostHog projects ("connections") shown as tiles on the
// home screen. Everything lives in expo-secure-store (iOS Keychain) — the
// connection list (name/project id/host) under one fixed key, and each
// Personal API Key under its own per-connection key. Originally the list
// used AsyncStorage, but Expo Go's current build doesn't ship that native
// module ("Native module is null, cannot access legacy storage"), so
// everything was moved to SecureStore instead, which Expo Go does support.
import * as SecureStore from 'expo-secure-store';

export type DashboardKind = 'generic' | 'bilinguist';

export interface Connection {
  id: string;
  name: string;
  projectId: string;
  host: string; // e.g. https://eu.posthog.com
  kind: DashboardKind;
}

const LIST_KEY = 'piggyfigs_connections_list';
const secretKey = (id: string) => `piggyfigs_key_${id.replace(/[^a-zA-Z0-9_.\-]/g, '_')}`;

function genId(): string {
  return `conn_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export async function listConnections(): Promise<Connection[]> {
  const raw = await SecureStore.getItemAsync(LIST_KEY);
  if (!raw) return [];
  try {
    const list = JSON.parse(raw) as Connection[];
    // Backfill for connections saved before `kind` existed.
    return list.map((c) => ({ ...c, kind: c.kind ?? 'generic' }));
  } catch {
    return [];
  }
}

async function saveList(list: Connection[]): Promise<void> {
  await SecureStore.setItemAsync(LIST_KEY, JSON.stringify(list));
}

export async function addConnection(input: {
  name: string;
  projectId: string;
  host: string;
  apiKey: string;
  kind: DashboardKind;
}): Promise<Connection> {
  const conn: Connection = {
    id: genId(),
    name: input.name.trim(),
    projectId: input.projectId.trim(),
    host: input.host.trim().replace(/\/$/, ''),
    kind: input.kind,
  };
  await SecureStore.setItemAsync(secretKey(conn.id), input.apiKey.trim());
  const list = await listConnections();
  list.push(conn);
  await saveList(list);
  return conn;
}

export async function removeConnection(id: string): Promise<void> {
  const list = await listConnections();
  await saveList(list.filter((c) => c.id !== id));
  await SecureStore.deleteItemAsync(secretKey(id)).catch(() => {});
}

export async function getApiKey(id: string): Promise<string | null> {
  return SecureStore.getItemAsync(secretKey(id));
}
