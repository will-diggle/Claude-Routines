import React, { useCallback, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, FlatList, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../App';
import { listConnections, removeConnection, type Connection } from '../lib/connections';

type Props = NativeStackScreenProps<RootStackParamList, 'Home'>;

const TILE_COLORS = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#9085e9'];

export function HomeScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const [connections, setConnections] = useState<Connection[]>([]);

  useFocusEffect(
    useCallback(() => {
      listConnections().then(setConnections);
    }, [])
  );

  function confirmRemove(conn: Connection) {
    Alert.alert(conn.name, 'Remove this app from Piggy Figs? This deletes its stored API key from this device.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          await removeConnection(conn.id);
          setConnections(await listConnections());
        },
      },
    ]);
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + 16 }]}>
      <Text style={styles.title}>Piggy Figs</Text>
      <Text style={styles.subtitle}>Your apps' PostHog analytics, in one place.</Text>

      <FlatList
        data={connections}
        keyExtractor={(c) => c.id}
        numColumns={2}
        columnWrapperStyle={{ gap: 14 }}
        contentContainerStyle={{ gap: 14, paddingTop: 20, paddingBottom: insets.bottom + 24 }}
        ListEmptyComponent={
          <Text style={styles.emptyText}>No apps connected yet. Tap "+ Add app" to connect your first PostHog project.</Text>
        }
        renderItem={({ item, index }) => (
          <TouchableOpacity
            style={[styles.tile, { borderColor: TILE_COLORS[index % TILE_COLORS.length] }]}
            onPress={() => navigation.navigate('Dashboard', { connection: item })}
            onLongPress={() => confirmRemove(item)}
          >
            <View style={[styles.tileIcon, { backgroundColor: TILE_COLORS[index % TILE_COLORS.length] }]}>
              <Text style={styles.tileIconText}>{item.name.slice(0, 1).toUpperCase()}</Text>
            </View>
            <Text style={styles.tileName} numberOfLines={1}>{item.name}</Text>
            <Text style={styles.tileSub}>Project {item.projectId}</Text>
          </TouchableOpacity>
        )}
      />

      <TouchableOpacity style={styles.addBtn} onPress={() => navigation.navigate('AddApp')}>
        <Ionicons name="add-circle" size={20} color="#fff" />
        <Text style={styles.addBtnText}>Add app</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0d0d0d', paddingHorizontal: 20 },
  title: { fontSize: 28, fontWeight: '800', color: '#fff' },
  subtitle: { fontSize: 13, color: '#898781', marginTop: 4 },
  emptyText: { color: '#898781', fontSize: 13, textAlign: 'center', marginTop: 60, paddingHorizontal: 20, lineHeight: 19 },
  tile: {
    flex: 1, backgroundColor: '#1a1a19', borderRadius: 16, padding: 16,
    borderWidth: 1, aspectRatio: 1, justifyContent: 'flex-end',
  },
  tileIcon: {
    width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginBottom: 12,
  },
  tileIconText: { color: '#fff', fontSize: 20, fontWeight: '800' },
  tileName: { color: '#fff', fontSize: 15, fontWeight: '700' },
  tileSub: { color: '#898781', fontSize: 11.5, marginTop: 2 },
  addBtn: {
    position: 'absolute', right: 20, bottom: 30,
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#3987e5', borderRadius: 999, paddingHorizontal: 18, paddingVertical: 12,
    shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 6,
  },
  addBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
});
