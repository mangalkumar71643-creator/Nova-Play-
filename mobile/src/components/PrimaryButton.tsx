import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { Pressable, StyleProp, StyleSheet, Text, ViewStyle } from 'react-native';
import { colors, gradients, radius, shadow, spacing, typography } from '../theme';

type Props = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  variant?: 'crimson' | 'gold';
  style?: StyleProp<ViewStyle>;
};

export default function PrimaryButton({ label, onPress, disabled, variant = 'crimson', style }: Props) {
  const gradient = variant === 'gold' ? gradients.goldButton : gradients.crimsonButton;
  const textColor = variant === 'gold' ? colors.background : colors.textPrimary;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [{ opacity: disabled ? 0.5 : pressed ? 0.85 : 1, transform: [{ scale: pressed ? 0.98 : 1 }] }, style]}
    >
      <LinearGradient colors={gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.button}>
        <Text style={[styles.label, { color: textColor }]}>{label}</Text>
      </LinearGradient>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    borderRadius: radius.pill,
    paddingVertical: spacing.md + 2,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.card,
  },
  label: {
    fontSize: typography.md,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
});
