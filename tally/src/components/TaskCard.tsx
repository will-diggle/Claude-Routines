import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import * as Haptics from 'expo-haptics';
import { theme } from '../theme';
import { Task } from '../types';
import { getStreak, getDaysThisYear, isCompletedToday } from '../store/useTaskStore';

interface Props {
  task: Task;
  onToggle: () => void;
  onPress: () => void;
}

export function TaskCard({ task, onToggle, onPress }: Props) {
  const streak = getStreak(task.completions);
  const daysThisYear = getDaysThisYear(task.completions);
  const done = isCompletedToday(task.completions);

  const handleToggle = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onToggle();
  };

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.75}>
      <View style={styles.left}>
        <Text style={styles.name} numberOfLines={2}>{task.name}</Text>
        <View style={styles.meta}>
          <Text style={[styles.streak, streak === 0 && styles.streakZero]}>
            {streak > 0 ? `${streak} day streak` : 'Start today'}
          </Text>
          {daysThisYear > 0 && (
            <Text style={styles.year}> · {daysThisYear} this year</Text>
          )}
        </View>
      </View>
      <TouchableOpacity
        style={[styles.check, done && styles.checkDone]}
        onPress={handleToggle}
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
      >
        {done && <Text style={styles.tick}>✓</Text>}
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md + 4,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.spacing.sm + 2,
  },
  left: {
    flex: 1,
    marginRight: theme.spacing.md,
  },
  name: {
    fontSize: theme.font.lg,
    fontWeight: '600',
    color: theme.colors.textDark,
    marginBottom: 5,
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  streak: {
    fontSize: theme.font.sm,
    fontWeight: '600',
    color: theme.colors.accent,
  },
  streakZero: {
    color: theme.colors.textMutedDark,
  },
  year: {
    fontSize: theme.font.sm,
    color: theme.colors.textMutedDark,
  },
  check: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 2,
    borderColor: theme.colors.checkBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkDone: {
    backgroundColor: theme.colors.accent,
    borderColor: theme.colors.accent,
  },
  tick: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
});
