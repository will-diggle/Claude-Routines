import React, { useCallback, useState } from 'react';
import { View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useAnimatedReaction,
  withSpring,
  runOnJS,
} from 'react-native-reanimated';
import type { SharedValue } from 'react-native-reanimated';

// ─── Per-row component ────────────────────────────────────────────────────────

interface RowProps {
  index: number;
  numItems: number;
  itemHeight: number;
  activeIndex: SharedValue<number>;
  dragOffset: SharedValue<number>;
  onStart: (index: number) => void;
  onFinish: (from: number, to: number) => void;
  children: React.ReactNode;
}

function DraggableRow({
  index,
  numItems,
  itemHeight,
  activeIndex,
  dragOffset,
  onStart,
  onFinish,
  children,
}: RowProps) {
  // Each row has its own animated shift value — smoothly animated by useAnimatedReaction
  const shift = useSharedValue(0);

  useAnimatedReaction(
    () => {
      const dragging = activeIndex.value;
      if (dragging === -1 || dragging === index) return 0;
      const target = Math.max(
        0,
        Math.min(numItems - 1, Math.round(dragging + dragOffset.value / itemHeight)),
      );
      if (dragging < target && index > dragging && index <= target) return -itemHeight;
      if (dragging > target && index >= target && index < dragging) return itemHeight;
      return 0;
    },
    (value) => {
      shift.value = withSpring(value, { damping: 22, stiffness: 280 });
    },
  );

  const gesture = Gesture.Pan()
    .activateAfterLongPress(450)
    .onStart(() => {
      activeIndex.value = index;
      dragOffset.value = 0;
      runOnJS(onStart)(index);
    })
    .onUpdate((e) => {
      dragOffset.value = e.translationY;
    })
    .onEnd(() => {
      const to = Math.max(
        0,
        Math.min(numItems - 1, Math.round(index + dragOffset.value / itemHeight)),
      );
      activeIndex.value = -1;
      dragOffset.value = withSpring(0, { damping: 22, stiffness: 280 });
      shift.value = withSpring(0, { damping: 22, stiffness: 280 });
      runOnJS(onFinish)(index, to);
    });

  const animStyle = useAnimatedStyle(() => {
    if (activeIndex.value === index) {
      return {
        transform: [{ translateY: dragOffset.value }, { scale: 1.02 }],
        zIndex: 99,
        shadowOpacity: 0.18,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 5 },
        elevation: 8,
      };
    }
    return {
      transform: [{ translateY: shift.value }, { scale: 1 }],
      zIndex: 0,
      shadowOpacity: 0,
      elevation: 0,
    };
  });

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View style={animStyle}>{children}</Animated.View>
    </GestureDetector>
  );
}

// ─── Container ────────────────────────────────────────────────────────────────

export interface DraggableListProps<T> {
  items: T[];
  keyExtractor: (item: T) => string;
  /** isAnyDragging lets the caller hide variable-height sub-rows during drag */
  renderItem: (item: T, index: number, isAnyDragging: boolean) => React.ReactNode;
  onReorder: (from: number, to: number) => void;
  /** Must match the CSS height of one rendered row exactly */
  itemHeight: number;
}

export function DraggableList<T>({
  items,
  keyExtractor,
  renderItem,
  onReorder,
  itemHeight,
}: DraggableListProps<T>) {
  const activeIndex = useSharedValue(-1);
  const dragOffset = useSharedValue(0);
  const [isAnyDragging, setIsAnyDragging] = useState(false);

  const handleStart = useCallback((idx: number) => {
    setIsAnyDragging(true);
  }, []);

  const handleFinish = useCallback(
    (from: number, to: number) => {
      setIsAnyDragging(false);
      if (from !== to) onReorder(from, to);
    },
    [onReorder],
  );

  return (
    <View>
      {items.map((item, index) => (
        <DraggableRow
          key={keyExtractor(item)}
          index={index}
          numItems={items.length}
          itemHeight={itemHeight}
          activeIndex={activeIndex}
          dragOffset={dragOffset}
          onStart={handleStart}
          onFinish={handleFinish}
        >
          {renderItem(item, index, isAnyDragging)}
        </DraggableRow>
      ))}
    </View>
  );
}
