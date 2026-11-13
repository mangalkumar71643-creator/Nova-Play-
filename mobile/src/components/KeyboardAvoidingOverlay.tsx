import React, { useRef } from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { useKeyboardOverlap } from '../utils/keyboard';

/**
 * The full-screen backdrop of a pop-up with a box to type in: its content is pushed up by the height the
 * on-screen keyboard covers, so the box and the button under it stay in view.
 */
export default function KeyboardAvoidingOverlay({ style, children }: { style?: StyleProp<ViewStyle>; children?: React.ReactNode }) {
  const ref = useRef<View>(null);
  const overlap = useKeyboardOverlap(ref);
  return (
    <View ref={ref} collapsable={false} style={[style, { paddingBottom: overlap }]}>
      {children}
    </View>
  );
}
