import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import React from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { Text } from './AppText';
import { IconName } from '../data/models';
import { colors, radius, spacing, typography } from '../theme';
import TapPressable from './TapPressable';

type Props = {
  label: string;
  onPress: () => void;
  icon?: IconName;
  style?: StyleProp<ViewStyle>;
};

export default function SecondaryButton({ label, onPress, icon, style }: Props) {
  return (
    <TapPressable
      onPress={onPress}
      style={({ pressed }) => [styles.button, { opacity: pressed ? 0.8 : 1 }, style]}
    >
      <View style={styles.content}>
        {icon ? <MaterialCommunityIcons name={icon} size={18} color={colors.gold} style={styles.icon} /> : null}
        <Text style={styles.label}>{label}</Text>
      </View>
    </TapPressable>
  );
}

const styles = StyleSheet.create({
  button: {
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surfaceAlt,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: { flexDirection: 'row', alignItems: 'center' },
  icon: { marginRight: spacing.xs },
  label: { color: colors.textPrimary, fontSize: typography.sm, fontWeight: '700' },
});
