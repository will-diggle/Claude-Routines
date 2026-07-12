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
import { Animated, PanResponder, View } from 'react-native';
import * as Haptics from 'expo-haptics';

// ── Spring configs ────────────────────────────────────────────────────────────

// Snappy displacement — item at crossover point slides decisively to its target slot.
const SHIFT_CONFIG = { damping: 26, stiffness: 600, mass: 0.6, useNativeDriver: true } as const;
const LIFT_CONFIG  = { damping: 16, stiffness: 380, mass: 0.5, useNativeDriver: true } as const;

const MAX_ITEMS        = 15;
const LONG_PRESS_MS    = 300;  // hold duration before drag activates
const CANCEL_THRESHOLD = 8;   // px movement before long press cancels
const GAP_BONUS        = 0;   // no extra shift — slot line provides the visual gap

// ── Drag context (shared between DraggableList and each DraggableRow) ─────────

interface DragCtx {
  translateYs:   Animated.Value[];
  scales:        Animated.Value[];
  itemCount:     () => number;
  itemHeight:    () => number;
  slotHeight:    (idx: number) => number;  // actual measured height for slot idx
  onDragStart:   (idx: number) => void;
  onDragMove:    (idx: number, dy: number) => void;
  onDragEnd:     (idx: number, dy: number) => void;
  onDragCancel:  (idx: number) => void;
  onRowLayout:   (idx: number, height: number) => void;
}

// ── Individual draggable row ──────────────────────────────────────────────────

interface DraggableRowProps {
  index:         number;
  ctx:           DragCtx;
  isDraggingThis: boolean;
  isDraggable:    boolean;
  children:       React.ReactNode;
}

function DraggableRow({
  index,
  ctx,
  isDraggingThis,
  isDraggable,
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
        shadowColor:   '#000',
        shadowOffset:  { width: 0, height: isDraggingThis ? 8 : 4 },
        shadowOpacity: isDraggingThis ? 0.18 : 0,
        shadowRadius:  isDraggingThis ? 12 : 8,
        elevation:     isDraggingThis ? 10 : 0,
      }}
      {...(isDraggable ? panResponder.panHandlers : {})}
    >
      {children}
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
  /**
   * Only the first draggableCount items can be picked up and reordered.
   * Items beyond this index are rendered statically (inactive section).
   * Defaults to items.length (all draggable).
   */
  draggableCount?: number;
}

export function DraggableList<T>({
  items,
  keyExtractor,
  renderItem,
  onReorder,
  itemHeight,
  onDragStateChange,
  draggableCount,
}: DraggableListProps<T>) {
  const [isDraggingState, setIsDraggingState] = useState(false);
  const [draggingIdx,     setDraggingIdx]     = useState(-1);

  // Stable refs so PanResponder callbacks always see latest prop values
  const itemsRef          = useRef(items);         itemsRef.current = items;
  const itemHeightRef     = useRef(itemHeight);    itemHeightRef.current = itemHeight;
  const onReorderRef      = useRef(onReorder);     onReorderRef.current = onReorder;
  const onDragStateRef    = useRef(onDragStateChange); onDragStateRef.current = onDragStateChange;
  const draggableCountRef = useRef(draggableCount); draggableCountRef.current = draggableCount;

  // Ref mirror of draggingIdx for callbacks that can't close over state
  const draggingIdxRef  = useRef(-1);

  // Actual rendered heights per slot, populated via onLayout.
  // Used so drag math stays correct even when cards have variable heights
  // (e.g. active language cards with expanded Length/Level rows).
  const measuredHeightsRef = useRef<number[]>(Array.from({ length: MAX_ITEMS }, () => 0));

  // Virtual order: virtualOrder[slot] = original item index.
  // Tracks the logical position of each item as the drag progresses,
  // so only the single item at the crossover point displaces — a true swap.
  const virtualOrderRef = useRef<number[]>([]);
  const prevTargetRef   = useRef(-1);

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
    slotHeight(idx) {
      // Use the measured height for this slot if available, else fall back to prop
      const m = measuredHeightsRef.current[idx];
      return m > 0 ? m : itemHeightRef.current;
    },

    onRowLayout(idx, height) {
      if (height > 0) measuredHeightsRef.current[idx] = height;
    },

    onDragStart(idx) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      Animated.spring(scales[idx], { toValue: 0.95, ...LIFT_CONFIG }).start();

      // Initialise virtual order: each slot holds its own index
      virtualOrderRef.current = itemsRef.current.map((_, i) => i);
      prevTargetRef.current   = idx;

      draggingIdxRef.current = idx;
      setDraggingIdx(idx);
      setIsDraggingState(true);
      onDragStateRef.current?.(true);
    },

    onDragMove(idx, dy) {
      const n     = itemsRef.current.length;
      const dragN = draggableCountRef.current ?? n;
      // Use measured height of the dragged item (all active cards are same height)
      const h = measuredHeightsRef.current[idx] > 0
        ? measuredHeightsRef.current[idx]
        : itemHeightRef.current;

      // Dragged item follows finger directly
      translateYs[idx].setValue(dy);

      const target    = Math.max(0, Math.min(dragN - 1, Math.round(idx + dy / h)));
      const prevTarget = prevTargetRef.current;

      if (target !== prevTarget) {
        // Swap the dragged item and the item currently occupying `target` slot
        const vo = virtualOrderRef.current;
        const itemAtTarget   = vo[target];
        vo[target]      = idx;
        vo[prevTarget]  = itemAtTarget;
        prevTargetRef.current = target;

        // Animate every non-dragging item to its exact virtual position
        for (let i = 0; i < dragN; i++) {
          if (i === idx) continue;
          const virtualSlot = vo.indexOf(i);
          const ih = measuredHeightsRef.current[i] > 0
            ? measuredHeightsRef.current[i]
            : itemHeightRef.current;
          Animated.spring(translateYs[i], { toValue: (virtualSlot - i) * ih, ...SHIFT_CONFIG }).start();
        }
      }
    },

    onDragEnd(idx, dy) {
      const n     = itemsRef.current.length;
      const dragN = draggableCountRef.current ?? n;
      const h = measuredHeightsRef.current[idx] > 0
        ? measuredHeightsRef.current[idx]
        : itemHeightRef.current;

      // Final slot = where the virtual order placed the dragged item
      const vo = virtualOrderRef.current;
      const to = vo.length > 0
        ? Math.max(0, Math.min(dragN - 1, vo.indexOf(idx)))
        : Math.max(0, Math.min(dragN - 1, Math.round(idx + dy / h)));

      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});

      // Reset all animated values immediately before onReorder re-renders the list.
      for (let i = 0; i < n; i++) {
        translateYs[i].setValue(0);
        scales[i].setValue(1);
      }

      draggingIdxRef.current = -1;
      setDraggingIdx(-1);
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
      draggingIdxRef.current = -1;
      setDraggingIdx(-1);
      setIsDraggingState(false);
      onDragStateRef.current?.(false);
    },
  }).current;

  const dragN = draggableCount ?? items.length;

  return (
    <View>
      {items.map((item, index) => {
        const isDraggingThis = draggingIdx === index;
        return (
          // Regular View (not Animated) — reliable onLayout for height measurement.
          // Also carries zIndex so dragged item renders above neighbours.
          <View
            key={keyExtractor(item)}
            style={{ zIndex: isDraggingThis ? 999 : 1 }}
            onLayout={(e) => {
              const h = e.nativeEvent.layout.height;
              if (h > 0) measuredHeightsRef.current[index] = h;
            }}
          >
            <DraggableRow
              index={index}
              ctx={ctx}
              isDraggingThis={isDraggingThis}
              isDraggable={index < dragN}
            >
              {renderItem(item, index, isDraggingState)}
            </DraggableRow>
          </View>
        );
      })}
    </View>
  );
}

