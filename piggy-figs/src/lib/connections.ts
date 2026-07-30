// Storage for the PostHog projects ("connections") shown as tiles on the
// home screen. Non-secret fields (name, project id, host) live in
// AsyncStorage as a plain list; the Personal API Key for each connection is
// stored separately in SecureStore (Keychain-backed on iOS) so it never sits
// in a plain-text list on disk.
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

export interface Connection {
  id: string;
  name: string;
  projectId: string;
  host: string; // e.g. https://eu.posthog.com
}

const LIST_KEY = 'piggyfigs.connections.v1';
const secretKey = (id: string) => `piggyfigs_key_${id.replace(/[^a-zA-Z0-9_.\-]/g, '_')}`;

function genId(): string {
  return `conn_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export async function listConnections(): Promise<Connection[]> {
  const raw = await AsyncStorage.getItem(LIST_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as Connection[];
  } catch {
    return [];
  }
}

async function saveList(list: Connection[]): Promise<void> {
  await AsyncStorage.setItem(LIST_KEY, JSON.stringify(list));
}

export async function addConnection(input: {
  name: string;
  projectId: string;
  host: string;
  apiKey: string;
}): Promise<Connection> {
  const conn: Connection = {
    id: genId(),
    name: input.name.trim(),
    projectId: input.projectId.trim(),
    host: input.host.trim().replace(/\/$/, ''),
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
