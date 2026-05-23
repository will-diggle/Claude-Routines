/**
 * DraggableList — Stage 2 rewrite
 *
 * Uses react-native-gesture-handler v2's Gesture.Pan().activateAfterLongPress()
 * so that normal scrolling is never blocked. The pan gesture only activates
 * after a 400 ms press, at which point the parent ScrollView releases the touch.
 *
 * Visual feedback (Apple Reminders style):
 *   • Long-press → item scales up slightly and gains a shadow ("lifted")
 *   • Drag → other items spring out of the way
 *   • Release → items spring back, order updates
 *
 * Supports up to 10 items (covers languages: 3, topics: 6).
 */

import React, { useState } from 'react';
import { View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';

// ── Spring configs ────────────────────────────────────────────────────────────

const SHIFT_SPRING = { damping: 22, stiffness: 280, mass: 0.8 } as const;
const LIFT_SPRING  = { damping: 18, stiffness: 350, mass: 0.6 } as const;

// ── Animated row ──────────────────────────────────────────────────────────────

interface AnimatedRowProps {
  index: number;
  draggingIndex: Animated.SharedValue<number>;
  floatY: Animated.SharedValue<number>;
  shift: Animated.SharedValue<number>;
  scale: Animated.SharedValue<number>;
  children: React.ReactNode;
}

function AnimatedRow({
  index,
  draggingIndex,
  floatY,
  shift,
  scale,
  children,
}: AnimatedRowProps) {
  const animStyle = useAnimatedStyle(() => {
    const isDragging = draggingIndex.value === index;
    return {
      transform: [
        { translateY: isDragging ? floatY.value : shift.value },
        { scale: scale.value },
      ],
      zIndex: isDragging ? 999 : 1,
      // iOS shadow
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: isDragging ? 0.14 : 0,
      shadowRadius: 8,
      // Android elevation
      elevation: isDragging ? 8 : 0,
    };
  });

  return <Animated.View style={animStyle}>{children}</Animated.View>;
}

// ── DraggableList ─────────────────────────────────────────────────────────────

export interface DraggableListProps<T> {
  items: T[];
  keyExtractor: (item: T) => string;
  /**
   * isAnyDragging lets the caller hide variable-height sub-rows during drag
   * so that all items remain the same height while reordering.
   */
  renderItem: (item: T, index: number, isAnyDragging: boolean) => React.ReactNode;
  onReorder: (from: number, to: number) => void;
  /** Must match the rendered height of one row exactly */
  itemHeight: number;
  /** Called when drag starts/ends so the parent ScrollView can be locked */
  onDragStateChange?: (isDragging: boolean) => void;
}

export function DraggableList<T>({
  items,
  keyExtractor,
  renderItem,
  onReorder,
  itemHeight,
  onDragStateChange,
}: DraggableListProps<T>) {
  const [isDraggingState, setIsDraggingState] = useState(false);

  // Shared values readable from useAnimatedStyle (UI thread)
  const draggingIndex = useSharedValue(-1);
  const floatY       = useSharedValue(0);

  // Pre-created pool of shift + scale values (max 10 items).
  // We cannot call useSharedValue inside a loop (hooks rule), so we create a
  // fixed set and slice to the actual item count at runtime.
  /* eslint-disable react-hooks/rules-of-hooks */
  const shift0 = useSharedValue(0); const scale0 = useSharedValue(1);
  const shift1 = useSharedValue(0); const scale1 = useSharedValue(1);
  const shift2 = useSharedValue(0); const scale2 = useSharedValue(1);
  const shift3 = useSharedValue(0); const scale3 = useSharedValue(1);
  const shift4 = useSharedValue(0); const scale4 = useSharedValue(1);
  const shift5 = useSharedValue(0); const scale5 = useSharedValue(1);
  const shift6 = useSharedValue(0); const scale6 = useSharedValue(1);
  const shift7 = useSharedValue(0); const scale7 = useSharedValue(1);
  const shift8 = useSharedValue(0); const scale8 = useSharedValue(1);
  const shift9 = useSharedValue(0); const scale9 = useSharedValue(1);
  /* eslint-enable react-hooks/rules-of-hooks */

  const shifts = [shift0, shift1, shift2, shift3, shift4, shift5, shift6, shift7, shift8, shift9];
  const scales = [scale0, scale1, scale2, scale3, scale4, scale5, scale6, scale7, scale8, scale9];

  // ── Drag callbacks (run on JS thread via .runOnJS(true)) ────────────────────

  function startDrag(idx: number) {
    draggingIndex.value = idx;
    floatY.value = 0;
    scales[idx].value = withSpring(1.045, LIFT_SPRING);
    setIsDraggingState(true);
    onDragStateChange?.(true);
  }

  function moveDrag(idx: number, dy: number) {
    const n = items.length;
    floatY.value = dy;
    const target = Math.max(0, Math.min(n - 1, Math.round(idx + dy / itemHeight)));
    for (let i = 0; i < n; i++) {
      if (i === idx) continue;
      let val = 0;
      if (idx < target && i > idx && i <= target) val = -itemHeight;
      if (idx > target && i >= target && i < idx) val = itemHeight;
      shifts[i].value = withSpring(val, SHIFT_SPRING);
    }
  }

  function finishDrag(idx: number, dy: number) {
    const n = items.length;
    const to = Math.max(0, Math.min(n - 1, Math.round(idx + dy / itemHeight)));
    draggingIndex.value = -1;
    floatY.value = 0;
    for (let i = 0; i < n; i++) {
      shifts[i].value = withSpring(0, SHIFT_SPRING);
      scales[i].value = withSpring(1, LIFT_SPRING);
    }
    setIsDraggingState(false);
    onDragStateChange?.(false);
    if (idx !== to) onReorder(idx, to);
  }

  function cancelDrag(idx: number) {
    const n = items.length;
    draggingIndex.value = -1;
    floatY.value = 0;
    for (let i = 0; i < n; i++) {
      shifts[i].value = withSpring(0, SHIFT_SPRING);
      scales[i].value = withSpring(1, LIFT_SPRING);
    }
    setIsDraggingState(false);
    onDragStateChange?.(false);
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <View>
      {items.map((item, index) => {
        const gesture = Gesture.Pan()
          // Only activates after a 400 ms press — before that, all touch
          // events are forwarded to the parent ScrollView as normal.
          .activateAfterLongPress(400)
          // Run callbacks on JS thread so we can call setState and onReorder
          // directly without runOnJS() wrappers. The withSpring() calls on
          // shared values still animate on the UI thread.
          .runOnJS(true)
          .onStart(() => startDrag(index))
          .onUpdate((e) => moveDrag(index, e.translationY))
          .onEnd((e) => finishDrag(index, e.translationY))
          .onFinalize(() => {
            // Handles gesture cancellation (e.g. interrupted by system).
            // If onEnd already ran it will have set draggingIndex to -1.
            if (draggingIndex.value === index) {
              cancelDrag(index);
            }
          });

        return (
          <GestureDetector key={keyExtractor(item)} gesture={gesture}>
            <AnimatedRow
              index={index}
              draggingIndex={draggingIndex}
              floatY={floatY}
              shift={shifts[index]}
              scale={scales[index]}
            >
              {renderItem(item, index, isDraggingState)}
            </AnimatedRow>
          </GestureDetector>
        );
      })}
    </View>
  );
}
