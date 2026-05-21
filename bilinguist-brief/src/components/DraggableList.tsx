import React, { useRef, useState } from 'react';
import { View, PanResponder, Animated } from 'react-native';

// ─── Per-row component ────────────────────────────────────────────────────────

interface RowProps {
  shift: Animated.Value;
  floatY: Animated.Value;
  isDragging: boolean;
  isAnyDragging: boolean;
  onActivate: () => void;
  onMove: (dy: number) => void;
  onRelease: (dy: number) => void;
  children: React.ReactNode;
}

function DraggableRow({
  shift,
  floatY,
  isDragging,
  onActivate,
  onMove,
  onRelease,
  children,
}: RowProps) {
  const activated = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep callbacks current without recreating the PanResponder
  const onActivateRef = useRef(onActivate);
  onActivateRef.current = onActivate;
  const onMoveRef = useRef(onMove);
  onMoveRef.current = onMove;
  const onReleaseRef = useRef(onRelease);
  onReleaseRef.current = onRelease;

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onStartShouldSetPanResponderCapture: () => false,
      onMoveShouldSetPanResponder: () => activated.current,
      onMoveShouldSetPanResponderCapture: () => activated.current,
      // Allow parent ScrollView to reclaim if not yet dragging
      onPanResponderTerminationRequest: () => !activated.current,
      onPanResponderGrant: () => {
        activated.current = false;
        timer.current = setTimeout(() => {
          activated.current = true;
          onActivateRef.current();
        }, 450);
      },
      onPanResponderMove: (_, gs) => {
        if (!activated.current) return;
        onMoveRef.current(gs.dy);
      },
      onPanResponderRelease: (_, gs) => {
        if (timer.current) clearTimeout(timer.current);
        const was = activated.current;
        activated.current = false;
        if (was) onReleaseRef.current(gs.dy);
      },
      onPanResponderTerminate: () => {
        if (timer.current) clearTimeout(timer.current);
        if (activated.current) {
          activated.current = false;
          onReleaseRef.current(0);
        }
      },
    })
  ).current;

  return (
    <Animated.View
      style={{
        transform: [{ translateY: isDragging ? floatY : shift }],
        zIndex: isDragging ? 999 : 1,
        elevation: isDragging ? 8 : 0,
        opacity: isDragging ? 0.96 : 1,
      }}
      {...pan.panHandlers}
    >
      {children}
    </Animated.View>
  );
}

// ─── Container ────────────────────────────────────────────────────────────────

export interface DraggableListProps<T> {
  items: T[];
  keyExtractor: (item: T) => string;
  /** isAnyDragging lets the caller hide variable-height sub-rows during drag */
  renderItem: (item: T, index: number, isAnyDragging: boolean) => React.ReactNode;
  onReorder: (from: number, to: number) => void;
  /** Must match the rendered height of one row exactly */
  itemHeight: number;
}

export function DraggableList<T>({
  items,
  keyExtractor,
  renderItem,
  onReorder,
  itemHeight,
}: DraggableListProps<T>) {
  const [draggingIndex, setDraggingIndex] = useState(-1);
  const draggingRef = useRef(-1);
  const floatY = useRef(new Animated.Value(0)).current;

  // Stable array of shift values — one per item position
  const shiftsRef = useRef<Animated.Value[]>([]);
  while (shiftsRef.current.length < items.length) {
    shiftsRef.current.push(new Animated.Value(0));
  }
  const shifts = shiftsRef.current;

  function computeTarget(from: number, dy: number) {
    return Math.max(0, Math.min(items.length - 1, from + Math.round(dy / itemHeight)));
  }

  function animateShifts(from: number, to: number) {
    for (let i = 0; i < items.length; i++) {
      if (i === from) continue;
      let val = 0;
      if (from < to && i > from && i <= to) val = -itemHeight;
      if (from > to && i >= to && i < from) val = itemHeight;
      Animated.spring(shifts[i], {
        toValue: val,
        damping: 20,
        stiffness: 300,
        useNativeDriver: true,
      }).start();
    }
  }

  function resetShifts() {
    shifts.forEach((s) =>
      Animated.spring(s, { toValue: 0, damping: 20, stiffness: 300, useNativeDriver: true }).start()
    );
  }

  return (
    <View>
      {items.map((item, index) => (
        <DraggableRow
          key={keyExtractor(item)}
          shift={shifts[index]}
          floatY={floatY}
          isDragging={draggingIndex === index}
          isAnyDragging={draggingIndex !== -1}
          onActivate={() => {
            draggingRef.current = index;
            floatY.setValue(0);
            setDraggingIndex(index);
          }}
          onMove={(dy) => {
            floatY.setValue(dy);
            animateShifts(draggingRef.current, computeTarget(draggingRef.current, dy));
          }}
          onRelease={(dy) => {
            const from = draggingRef.current;
            const to = computeTarget(from, dy);
            resetShifts();
            setDraggingIndex(-1);
            draggingRef.current = -1;
            floatY.setValue(0);
            if (from !== to) onReorder(from, to);
          }}
        >
          {renderItem(item, index, draggingIndex !== -1)}
        </DraggableRow>
      ))}
    </View>
  );
}
