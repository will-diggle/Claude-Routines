import React, { useCallback, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, FlatList, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../App';
import { listConnections, removeConnection, type Connection } from '../lib/connections';
import { GlassButton } from '../components/GlassButton';
import { useTheme, SPACING, RADIUS, LABEL_STYLE, FONT_SERIF } from '../theme/tokens';

type Props = NativeStackScreenProps<RootStackParamList, 'Home'>;

const TILE_COLORS = ['#8B1A1A', '#7D6B4F', '#3987e5', '#199e70', '#d55181', '#9085e9'];

export function HomeScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
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
    <View style={[styles.container, { backgroundColor: colors.bg, paddingTop: insets.top + 16 }]}>
      <View style={[styles.masthead, { borderBottomColor: colors.ink }]}>
        <Text style={[styles.eyebrow, { color: colors.inkFaint }]}>Portfolio Analytics</Text>
        <Text style={[styles.title, { color: colors.ink }]}>Piggy Figs</Text>
      </View>

      <Text style={[styles.sectionLabel, { color: colors.inkFaint, borderTopColor: colors.border }]}>Your Apps</Text>

      <FlatList
        data={connections}
        keyExtractor={(c) => c.id}
        numColumns={2}
        columnWrapperStyle={{ gap: SPACING.md }}
        contentContainerStyle={{ gap: SPACING.md, paddingBottom: insets.bottom + SPACING.xl }}
        ListEmptyComponent={
          <Text style={[styles.emptyText, { color: colors.inkFaint }]}>
            No apps connected yet. Tap "+ Add app" to connect your first PostHog project.
          </Text>
        }
        renderItem={({ item, index }) => (
          <TouchableOpacity
            style={[styles.tile, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={() => navigation.navigate('Dashboard', { connection: item })}
            onLongPress={() => confirmRemove(item)}
          >
            <View style={[styles.tileIcon, { backgroundColor: TILE_COLORS[index % TILE_COLORS.length] }]}>
              <Text style={styles.tileIconText}>{item.name.slice(0, 1).toUpperCase()}</Text>
            </View>
            <Text style={[styles.tileName, { color: colors.ink }]} numberOfLines={1}>{item.name}</Text>
            <Text style={[styles.tileSub, { color: colors.inkFaint }]}>Project {item.projectId}</Text>
          </TouchableOpacity>
        )}
      />

      <GlassButton
        active
        tintColor={colors.chrome}
        style={styles.addBtn}
        onPress={() => navigation.navigate('AddApp')}
      >
        <View style={styles.addBtnInner}>
          <Ionicons name="add-circle" size={20} color={colors.bg} />
          <Text style={[styles.addBtnText, { color: colors.bg }]}>Add app</Text>
        </View>
      </GlassButton>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: SPACING.lg },
  masthead: { alignItems: 'center', paddingBottom: SPACING.md, marginBottom: SPACING.md, borderBottomWidth: 3 },
  eyebrow: { ...LABEL_STYLE, marginBottom: SPACING.sm },
  title: { fontFamily: FONT_SERIF, fontSize: 42, fontWeight: '700', letterSpacing: -1 },
  sectionLabel: { ...LABEL_STYLE, borderTopWidth: 1, paddingTop: SPACING.sm, marginBottom: SPACING.md },
  emptyText: { fontSize: 13, textAlign: 'center', marginTop: 60, paddingHorizontal: 20, lineHeight: 19 },
  tile: {
    flex: 1, borderRadius: RADIUS.card, padding: SPACING.md,
    borderWidth: StyleSheet.hairlineWidth, aspectRatio: 1, justifyContent: 'flex-end',
    shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 5,
  },
  tileIcon: {
    width: 44, height: 44, borderRadius: RADIUS.card, alignItems: 'center', justifyContent: 'center', marginBottom: SPACING.sm,
  },
  tileIconText: { color: '#fff', fontSize: 20, fontFamily: FONT_SERIF, fontWeight: '700' },
  tileName: { fontSize: 15, fontFamily: FONT_SERIF, fontWeight: '700' },
  tileSub: { fontSize: 11.5, marginTop: 2 },
  addBtn: {
    position: 'absolute', right: SPACING.lg, bottom: 30, borderRadius: RADIUS.pill,
  },
  addBtnInner: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    paddingHorizontal: 18, paddingVertical: 12,
  },
  addBtnText: { fontWeight: '700', fontSize: 14 },
});
