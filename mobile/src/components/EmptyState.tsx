import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { IconName } from '../data/models';
import { colors, spacing, typography } from '../theme';

type Props = { icon: IconName; title: string; subtitle?: string };

export default function EmptyState({ icon, title, subtitle }: Props) {
  return (
    <View style={styles.wrap}>
      <MaterialCommunityIcons name={icon} size={40} color={colors.textMuted} />
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.xxxl },
  title: { color: colors.textSecondary, fontWeight: '700', fontSize: typography.md, marginTop: spacing.md },
  subtitle: { color: colors.textMuted, fontSize: typography.sm, marginTop: spacing.xs, textAlign: 'center', paddingHorizontal: spacing.xl },
});
