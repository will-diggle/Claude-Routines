import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  StatusBar,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { theme } from '../theme';
import {
  useTaskStore,
  getStreak,
  getDaysThisYear,
  isCompletedToday,
  getLast30Days,
} from '../store/useTaskStore';
import { RootStackParamList } from '../types';

type Nav = NativeStackNavigationProp<RootStackParamList, 'TaskDetail'>;
type Route = RouteProp<RootStackParamList, 'TaskDetail'>;

function getDaysInYear(): number {
  const year = new Date().getFullYear();
  return (year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)) ? 366 : 365;
}

export function TaskDetailScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const insets = useSafeAreaInsets();
  const { tasks, toggleToday, removeTask } = useTaskStore();

  const task = tasks.find((t) => t.id === route.params.taskId);

  if (!task) {
    navigation.goBack();
    return null;
  }

  const streak = getStreak(task.completions);
  const daysThisYear = getDaysThisYear(task.completions);
  const done = isCompletedToday(task.completions);
  const last30 = getLast30Days(task.completions);
  const daysInYear = getDaysInYear();
  const yearProgress = daysThisYear / daysInYear;

  const handleToggle = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    toggleToday(task.id);
  };

  const handleDelete = () => {
    Alert.alert(
      'Delete habit',
      `Remove "${task.name}" and all its history?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            removeTask(task.id);
            navigation.goBack();
          },
        },
      ]
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="light-content" />

      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Text style={styles.back}>←</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]} showsVerticalScrollIndicator={false}>
        <Text style={styles.taskName}>{task.name}</Text>

        {/* Streak */}
        <View style={styles.streakBlock}>
          <Text style={styles.streakNumber}>{streak}</Text>
          <Text style={styles.streakLabel}>day streak</Text>
        </View>

        {/* Check in button */}
        <TouchableOpacity
          style={[styles.checkBtn, done && styles.checkBtnDone]}
          onPress={handleToggle}
          activeOpacity={0.8}
        >
          <Text style={styles.checkBtnText}>
            {done ? 'Done today ✓' : 'Mark today'}
          </Text>
        </TouchableOpacity>

        {/* Year progress */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>This year</Text>
            <Text style={styles.sectionValue}>{daysThisYear} / {daysInYear} days</Text>
          </View>
          <View style={styles.progressBg}>
            <View style={[styles.progressFill, { width: `${yearProgress * 100}%` }]} />
          </View>
        </View>

        {/* Last 30 days */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Last 30 days</Text>
          <View style={styles.dots}>
            {last30.map((day) => (
              <View
                key={day.date}
                style={[styles.dot, day.done && styles.dotDone]}
              />
            ))}
          </View>
        </View>

        {/* Delete */}
        <TouchableOpacity style={styles.deleteBtn} onPress={handleDelete} activeOpacity={0.7}>
          <Text style={styles.deleteBtnText}>Delete habit</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.bg,
  },
  header: {
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.md,
    paddingBottom: theme.spacing.sm,
  },
  back: {
    fontSize: theme.font.xl,
    color: theme.colors.text,
  },
  content: {
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.md,
  },
  taskName: {
    fontSize: theme.font.xl,
    fontWeight: '700',
    color: theme.colors.text,
    marginBottom: theme.spacing.xl,
    lineHeight: 30,
  },
  streakBlock: {
    alignItems: 'center',
    marginBottom: theme.spacing.xl,
  },
  streakNumber: {
    fontSize: theme.font.hero,
    fontWeight: '700',
    color: theme.colors.accent,
    lineHeight: theme.font.hero,
  },
  streakLabel: {
    fontSize: theme.font.md,
    color: theme.colors.textMuted,
    marginTop: theme.spacing.xs,
    letterSpacing: 1,
  },
  checkBtn: {
    backgroundColor: theme.colors.bgCard,
    borderRadius: theme.radius.md,
    paddingVertical: theme.spacing.md,
    alignItems: 'center',
    marginBottom: theme.spacing.xl,
    borderWidth: 1.5,
    borderColor: theme.colors.accentDim,
  },
  checkBtnDone: {
    backgroundColor: theme.colors.accent,
    borderColor: theme.colors.accent,
  },
  checkBtnText: {
    color: theme.colors.text,
    fontSize: theme.font.lg,
    fontWeight: '600',
  },
  section: {
    marginBottom: theme.spacing.xl,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.sm,
  },
  sectionTitle: {
    fontSize: theme.font.sm,
    fontWeight: '600',
    color: theme.colors.textMuted,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  sectionValue: {
    fontSize: theme.font.sm,
    color: theme.colors.textMuted,
  },
  progressBg: {
    height: 6,
    backgroundColor: theme.colors.bgCard,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: theme.colors.accent,
    borderRadius: 3,
  },
  dots: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: theme.spacing.sm,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: theme.colors.bgCard,
  },
  dotDone: {
    backgroundColor: theme.colors.accent,
  },
  deleteBtn: {
    marginTop: theme.spacing.xl,
    paddingVertical: theme.spacing.md,
    alignItems: 'center',
  },
  deleteBtnText: {
    fontSize: theme.font.md,
    color: theme.colors.danger,
  },
});
