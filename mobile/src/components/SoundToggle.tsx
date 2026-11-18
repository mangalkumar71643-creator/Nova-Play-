import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import React from 'react';
import { Pressable, StyleProp, StyleSheet, ViewStyle } from 'react-native';

import { setSoundEnabled, useSoundEnabled } from '../sound/engine';

type Props = {
  style?: StyleProp<ViewStyle>;
  color?: string;
  size?: number;
};

/** A small speaker button that switches everything you hear in the games (effects and music) on and off. */
export default function SoundToggle({ style, color = '#FFFFFF', size = 20 }: Props) {
  const on = useSoundEnabled();
  return (
    <Pressable
      onPress={() => setSoundEnabled(!on)}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel={on ? 'Mute game sounds' : 'Unmute game sounds'}
      style={[styles.button, style]}
    >
      <MaterialCommunityIcons name={on ? 'volume-high' : 'volume-off'} size={size} color={color} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
});
