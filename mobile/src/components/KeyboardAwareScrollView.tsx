import React, { useCallback, useRef } from 'react';
import { ScrollView, ScrollViewProps, StyleSheet, View } from 'react-native';
import { focusedInput, useAfterKeyboardShown, useKeyboardOverlap } from '../utils/keyboard';

/**
 * A ScrollView that keeps the box being typed in above the on-screen keyboard: when the keyboard opens the
 * page gets that much room at its bottom and scrolls the box to near the top of the visible part.
 * A drop-in for ScrollView.
 */
export default function KeyboardAwareScrollView({ contentContainerStyle, style, children, ...rest }: ScrollViewProps) {
  const box = useRef<View>(null);
  const scroll = useRef<ScrollView>(null);
  const overlap = useKeyboardOverlap(box);

  const showFocused = useCallback(() => {
    const input = focusedInput();
    const inner = (scroll.current as unknown as { getInnerViewRef?: () => unknown } | null)?.getInnerViewRef?.();
    if (!input || !inner) return;
    // The box's place inside the scrolled content: bring it to about a fifth of the way down the visible part.
    input.measureLayout(inner, (_x, y) => scroll.current?.scrollTo({ y: Math.max(0, y - 120), animated: true }), () => {});
  }, []);
  useAfterKeyboardShown(showFocused);

  const base = (StyleSheet.flatten(contentContainerStyle) as { paddingBottom?: number } | undefined)?.paddingBottom ?? 0;
  return (
    <View ref={box} collapsable={false} style={[styles.fill, style]}>
      <ScrollView ref={scroll} {...rest} style={styles.fill} contentContainerStyle={[contentContainerStyle, { paddingBottom: base + overlap }]}>
        {children}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({ fill: { flex: 1 } });
