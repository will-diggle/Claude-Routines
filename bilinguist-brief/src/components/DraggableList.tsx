/**
 * DraggableList — React Native Animated rewrite
 *
 * Replaces react-native-reanimated with React Native's built-in Animated API
 * and PanResponder. Same external interface as the original.
 *
 * Visual feedback (Apple Reminders style):
 *   • Long-press (400ms) → item scales up slightly ("lifted")
 *   • Drag → other items spring out of the way
 *   • Release → items spring back, order updates
 *
 * Supports up to 10 items (covers languages: 3, topics: 6).
 */

import React, { useRef, useState } from 'react';
import { Animated, PanResponder, View } from 'react-native';

// ── Spring configs ────────────────────────────────────────────────────────────

const SHIFT_CONFIG = { damping: 22, stiffness: 280, mass: 0.8, useNativeDriver: true } as const;
const LIFT_CONFIG  = { damping: 18, stiffness: 350, mass: 0.6, useNativeDriver: true } as const;

const MAX_ITEMS = 10;
const LONG_PRESS_MS = 400;
const CANCEL_THRESHOLD = 8; // px movement before long press cancels

// ── Drag context (shared between DraggableList and each DraggableRow) ─────────

interface DragCtx {
  translateYs: Animated.Value[];
  scales: Animated.Value[];
  itemCount: () => number;
  itemHeight: () => number;
  onDragStart:  (idx: number) => void;
  onDragMove:   (idx: number, dy: number) => void;
  onDragEnd:    (idx: number, dy: number) => void;
  onDragCancel: (idx: number) => void;
}

// ── Individual draggable row ──────────────────────────────────────────────────

interface DraggableRowProps {
  index: number;
  ctx: DragCtx;
  isDraggingThis: boolean;
  isDraggingAny: boolean;
  children: React.ReactNode;
}

function DraggableRow({ index, ctx, isDraggingThis, isDraggingAny, children }: DraggableRowProps) {
  // Keep a ref so the stable PanResponder always reads the latest index
  const indexRef = useRef(index);
  indexRef.current = index;

  const panResponder = useRef((() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let active = false;

    return PanResponder.create({
      // Don't grab on touch start — let ScrollView handle taps/scrolls first
      onStartShouldSetPanResponder:        () => false,
      onStartShouldSetPanResponderCapture: () => false,
      // Grab during move only once long-press has fired
      onMoveShouldSetPanResponder:         () => active,
      onMoveShouldSetPanResponderCapture:  () => active,

      onPanResponderGrant: () => {
        timer = setTimeout(() => {
          active = true;
          ctx.onDragStart(indexRef.current);
        }, LONG_PRESS_MS);
      },

      onPanResponderMove: (_, gs) => {
        if (!active) {
          // Cancel long-press if the finger moves significantly before 400ms
          if (timer && (Math.abs(gs.dy) > CANCEL_THRESHOLD || Math.abs(gs.dx) > CANCEL_THRESHOLD)) {
            clearTimeout(timer);
            timer = null;
          }
          return;
        }
        ctx.onDragMove(indexRef.current, gs.dy);
      },

      onPanResponderRelease: (_, gs) => {
        if (timer) { clearTimeout(timer); timer = null; }
        if (!active) return;
        active = false;
        ctx.onDragEnd(indexRef.current, gs.dy);
      },

      onPanResponderTerminate: () => {
        if (timer) { clearTimeout(timer); timer = null; }
        if (!active) return;
        active = false;
        ctx.onDragCancel(indexRef.current);
      },
    });
  })()).current;

  return (
    <Animated.View
      style={{
        transform: [
          { translateY: ctx.translateYs[index] },
          { scale:      ctx.scales[index] },
        ],
        zIndex:        isDraggingThis ? 999 : 1,
        shadowColor:   '#000',
        shadowOffset:  { width: 0, height: 4 },
        shadowOpacity: isDraggingThis ? 0.14 : 0,
        shadowRadius:  8,
        elevation:     isDraggingThis ? 8 : 0,
      }}
      {...panResponder.panHandlers}
    >
      {children}
    </Animated.View>
  );
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
  const [draggingIdx,     setDraggingIdx]     = useState(-1);

  // Stable refs so PanResponder callbacks always see latest prop values
  const itemsRef            = useRef(items);       itemsRef.current = items;
  const itemHeightRef       = useRef(itemHeight);  itemHeightRef.current = itemHeight;
  const onReorderRef        = useRef(onReorder);   onReorderRef.current = onReorder;
  const onDragStateRef      = useRef(onDragStateChange); onDragStateRef.current = onDragStateChange;

  // Pre-create animated values for up to MAX_ITEMS rows
  const translateYs = useRef(
    Array.from({ length: MAX_ITEMS }, () => new Animated.Value(0))
  ).current;
  const scales = useRef(
    Array.from({ length: MAX_ITEMS }, () => new Animated.Value(1))
  ).current;

  // Stable drag-context object (created once, callbacks use refs)
  const ctx = useRef<DragCtx>({
    translateYs,
    scales,
    itemCount:  () => itemsRef.current.length,
    itemHeight: () => itemHeightRef.current,

    onDragStart(idx) {
      Animated.spring(scales[idx], { toValue: 1.045, ...LIFT_CONFIG }).start();
      setIsDraggingState(true);
      setDraggingIdx(idx);
      onDragStateRef.current?.(true);
    },

    onDragMove(idx, dy) {
      const n = itemsRef.current.length;
      const h = itemHeightRef.current;
      translateYs[idx].setValue(dy);
      const target = Math.max(0, Math.min(n - 1, Math.round(idx + dy / h)));
      for (let i = 0; i < n; i++) {
        if (i === idx) continue;
        let val = 0;
        if (idx < target && i > idx && i <= target) val = -h;
        if (idx > target && i >= target && i < idx) val = h;
        Animated.spring(translateYs[i], { toValue: val, ...SHIFT_CONFIG }).start();
      }
    },

    onDragEnd(idx, dy) {
      const n = itemsRef.current.length;
      const h = itemHeightRef.current;
      const to = Math.max(0, Math.min(n - 1, Math.round(idx + dy / h)));
      for (let i = 0; i < n; i++) {
        Animated.spring(translateYs[i], { toValue: 0, ...SHIFT_CONFIG }).start();
        Animated.spring(scales[i],      { toValue: 1, ...LIFT_CONFIG  }).start();
      }
      setIsDraggingState(false);
      setDraggingIdx(-1);
      onDragStateRef.current?.(false);
      if (idx !== to) onReorderRef.current(idx, to);
    },

    onDragCancel(idx) {
      const n = itemsRef.current.length;
      for (let i = 0; i < n; i++) {
        Animated.spring(translateYs[i], { toValue: 0, ...SHIFT_CONFIG }).start();
        Animated.spring(scales[i],      { toValue: 1, ...LIFT_CONFIG  }).start();
      }
      setIsDraggingState(false);
      setDraggingIdx(-1);
      onDragStateRef.current?.(false);
    },
  }).current;

  return (
    <View>
      {items.map((item, index) => (
        <DraggableRow
          key={keyExtractor(item)}
          index={index}
          ctx={ctx}
          isDraggingAny={isDraggingState}
          isDraggingThis={draggingIdx === index}
        >
          {renderItem(item, index, isDraggingState)}
        </DraggableRow>
      ))}
    </View>
  );
}
