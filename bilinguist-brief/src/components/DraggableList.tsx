/**
 * DraggableList — React Native Animated rewrite
 *
 * Visual feedback (polished drag UX):
 *   • Long-press (300 ms) → item shrinks slightly ("plucked off the list") +
 *     light haptic impact so it feels like a physical click
 *   • Drag → other items spring out of the way smoothly, leaving a visible
 *     coloured-line "slot" at the insertion point
 *   • Release → items spring back, order updates
 *
 * Supports up to 10 items (covers languages: 3, topics: 6).
 */

import React, { useRef, useState } from 'react';
import { Animated, PanResponder, View, StyleSheet } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../hooks/useTheme';

// ── Spring configs ────────────────────────────────────────────────────────────

const SHIFT_CONFIG = { damping: 20, stiffness: 300, mass: 0.7, useNativeDriver: true } as const;
const LIFT_CONFIG  = { damping: 16, stiffness: 380, mass: 0.5, useNativeDriver: true } as const;

const MAX_ITEMS        = 15;
const LONG_PRESS_MS    = 300;  // hold duration before drag activates
const CANCEL_THRESHOLD = 8;   // px movement before long press cancels
const GAP_BONUS        = 14;  // extra px neighbours shift beyond item height → visible slot gap

// ── Drag context (shared between DraggableList and each DraggableRow) ─────────

interface DragCtx {
  translateYs: Animated.Value[];
  scales:      Animated.Value[];
  itemCount:  () => number;
  itemHeight: () => number;
  onDragStart:  (idx: number) => void;
  onDragMove:   (idx: number, dy: number) => void;
  onDragEnd:    (idx: number, dy: number) => void;
  onDragCancel: (idx: number) => void;
}

// ── Individual draggable row ──────────────────────────────────────────────────

interface DraggableRowProps {
  index:         number;
  ctx:           DragCtx;
  isDraggingThis: boolean;
  isDraggingAny:  boolean;
  isDropTarget:   boolean;
  dropEdge:       'top' | 'bottom' | null;
  slotColor:      string;
  children:       React.ReactNode;
}

function DraggableRow({
  index,
  ctx,
  isDraggingThis,
  isDraggingAny,
  isDropTarget,
  dropEdge,
  slotColor,
  children,
}: DraggableRowProps) {
  // Keep a ref so the stable PanResponder always reads the latest index
  const indexRef = useRef(index);
  indexRef.current = index;

  const panResponder = useRef((() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let active = false;

    return PanResponder.create({
      // Claim the responder on touch start so the long-press timer can begin.
      // Do NOT capture so child buttons (Switch, TouchableOpacity) still work.
      onStartShouldSetPanResponder:        () => true,
      onStartShouldSetPanResponderCapture: () => false,
      // Re-claim during move once long-press has confirmed drag intent
      onMoveShouldSetPanResponder:        () => active,
      onMoveShouldSetPanResponderCapture: () => active,

      // Yield to ScrollView while we're NOT dragging
      onPanResponderTerminationRequest: () => !active,

      onPanResponderGrant: () => {
        timer = setTimeout(() => {
          active = true;
          ctx.onDragStart(indexRef.current);
        }, LONG_PRESS_MS);
      },

      onPanResponderMove: (_, gs) => {
        if (!active) {
          // Cancel long-press if finger moves significantly before it fires
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
        shadowOffset:  { width: 0, height: isDraggingThis ? 8 : 4 },
        shadowOpacity: isDraggingThis ? 0.18 : 0,
        shadowRadius:  isDraggingThis ? 12 : 8,
        elevation:     isDraggingThis ? 10 : 0,
      }}
      {...panResponder.panHandlers}
    >
      {children}

      {/* Drop-slot indicator line */}
      {isDraggingAny && isDropTarget && !isDraggingThis && dropEdge && (
        <View
          style={[
            styles.slotLine,
            { backgroundColor: slotColor },
            dropEdge === 'top'    && styles.slotTop,
            dropEdge === 'bottom' && styles.slotBottom,
          ]}
        />
      )}
    </Animated.View>
  );
}

// ── DraggableList ─────────────────────────────────────────────────────────────

export interface DraggableListProps<T> {
  items:        T[];
  keyExtractor: (item: T) => string;
  /**
   * isAnyDragging lets the caller hide variable-height sub-rows during drag
   * so that all items remain the same height while reordering.
   */
  renderItem:   (item: T, index: number, isAnyDragging: boolean) => React.ReactNode;
  onReorder:    (from: number, to: number) => void;
  /** Must match the rendered height of one row exactly */
  itemHeight:   number;
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
  const { colors } = useTheme();

  const [isDraggingState, setIsDraggingState] = useState(false);
  const [draggingIdx,     setDraggingIdx]     = useState(-1);
  const [dropTargetIdx,   setDropTargetIdx]   = useState(-1);

  // Stable refs so PanResponder callbacks always see latest prop values
  const itemsRef       = useRef(items);       itemsRef.current = items;
  const itemHeightRef  = useRef(itemHeight);  itemHeightRef.current = itemHeight;
  const onReorderRef   = useRef(onReorder);   onReorderRef.current = onReorder;
  const onDragStateRef = useRef(onDragStateChange); onDragStateRef.current = onDragStateChange;

  // Ref mirror of draggingIdx/dropTargetIdx for callbacks that can't close over state
  const draggingIdxRef  = useRef(-1);
  const dropTargetIdxRef = useRef(-1);

  // Pre-create animated values for up to MAX_ITEMS rows
  const translateYs = useRef(
    Array.from({ length: MAX_ITEMS }, () => new Animated.Value(0)),
  ).current;
  const scales = useRef(
    Array.from({ length: MAX_ITEMS }, () => new Animated.Value(1)),
  ).current;

  // Stable drag-context (created once, callbacks use refs)
  const ctx = useRef<DragCtx>({
    translateYs,
    scales,
    itemCount:  () => itemsRef.current.length,
    itemHeight: () => itemHeightRef.current,

    onDragStart(idx) {
      // Gentle haptic "click" so it feels like the item snapped free
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});

      // Scale DOWN a little — item looks "plucked off" / hovering
      Animated.spring(scales[idx], { toValue: 0.95, ...LIFT_CONFIG }).start();

      draggingIdxRef.current  = idx;
      dropTargetIdxRef.current = idx;
      setDraggingIdx(idx);
      setDropTargetIdx(idx);
      setIsDraggingState(true);
      onDragStateRef.current?.(true);
    },

    onDragMove(idx, dy) {
      const n = itemsRef.current.length;
      const h = itemHeightRef.current;

      // Move the dragged item exactly with the finger
      translateYs[idx].setValue(dy);

      const target = Math.max(0, Math.min(n - 1, Math.round(idx + dy / h)));

      // Update drop-target state for slot indicator (only when it changes)
      if (target !== dropTargetIdxRef.current) {
        dropTargetIdxRef.current = target;
        setDropTargetIdx(target);
      }

      // Shift neighbouring items out of the way — extra GAP_BONUS makes the slot obvious
      for (let i = 0; i < n; i++) {
        if (i === idx) continue;
        let val = 0;
        if (idx < target && i > idx && i <= target) val = -(h + GAP_BONUS);
        if (idx > target && i >= target && i < idx) val =  (h + GAP_BONUS);
        Animated.spring(translateYs[i], { toValue: val, ...SHIFT_CONFIG }).start();
      }
    },

    onDragEnd(idx, dy) {
      const n = itemsRef.current.length;
      const h = itemHeightRef.current;
      const to = Math.max(0, Math.min(n - 1, Math.round(idx + dy / h)));

      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});

      // Reset ALL animated values instantly before calling onReorder.
      // If we spring-animate back to 0 first, React re-renders the new item
      // order while translateYs still hold the shifted values → snap-back glitch.
      for (let i = 0; i < n; i++) {
        translateYs[i].setValue(0);
        scales[i].setValue(1);
      }

      draggingIdxRef.current   = -1;
      dropTargetIdxRef.current = -1;
      setDraggingIdx(-1);
      setDropTargetIdx(-1);
      setIsDraggingState(false);
      onDragStateRef.current?.(false);
      if (idx !== to) onReorderRef.current(idx, to);
    },

    onDragCancel(idx) {
      const n = itemsRef.current.length;
      for (let i = 0; i < n; i++) {
        Animated.spring(translateYs[i], { toValue: 0, ...SHIFT_CONFIG }).start();
        Animated.spring(scales[i],      { toValue: 1, ...LIFT_CONFIG  }).start();
      }
      draggingIdxRef.current   = -1;
      dropTargetIdxRef.current = -1;
      setDraggingIdx(-1);
      setDropTargetIdx(-1);
      setIsDraggingState(false);
      onDragStateRef.current?.(false);
    },
  }).current;

  return (
    <View>
      {items.map((item, index) => {
        // Determine which edge of this row should show the slot indicator
        let dropEdge: 'top' | 'bottom' | null = null;
        if (isDraggingState && index === dropTargetIdx && index !== draggingIdx) {
          dropEdge = draggingIdx < dropTargetIdx ? 'bottom' : 'top';
        }

        return (
          <DraggableRow
            key={keyExtractor(item)}
            index={index}
            ctx={ctx}
            isDraggingAny={isDraggingState}
            isDraggingThis={draggingIdx === index}
            isDropTarget={index === dropTargetIdx && index !== draggingIdx}
            dropEdge={dropEdge}
            slotColor={colors.accentGold}
          >
            {renderItem(item, index, isDraggingState)}
          </DraggableRow>
        );
      })}
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  slotLine: {
    position: 'absolute',
    left:  16,
    right: 16,
    height: 2.5,
    borderRadius: 2,
    opacity: 0.85,
  },
  slotTop:    { top:    0 },
  slotBottom: { bottom: 0 },
});
