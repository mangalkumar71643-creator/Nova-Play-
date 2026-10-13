import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, gradients, radius, shadow, spacing, typography } from '../theme';

type Props = { coins: number; label?: string };

export default function VirtualBalanceCard({ coins, label = 'Coin Balance' }: Props) {
  return (
    <LinearGradient colors={gradients.balanceCard} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.card}>
      <View style={styles.headerRow}>
        <MaterialCommunityIcons name="wallet-outline" size={20} color={colors.gold} />
        <Text style={styles.label}>{label}</Text>
      </View>
      <View style={styles.balanceRow}>
        <MaterialCommunityIcons name="circle-multiple" size={30} color={colors.gold} />
        <Text style={styles.balance}>{coins.toLocaleString('en-IN')}</Text>
      </View>
      <Text style={styles.disclaimer}>1 Coin = 1 unit of real money · 18+</Text>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: spacing.lg,
    borderRadius: radius.xl,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    ...shadow.card,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center' },
  label: { color: colors.textSecondary, fontSize: typography.sm, marginLeft: spacing.xs, fontWeight: '600' },
  balanceRow: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.md },
  balance: { color: colors.gold, fontSize: typography.display, fontWeight: '800', marginLeft: spacing.sm },
  disclaimer: { color: colors.textMuted, fontSize: typography.xs, marginTop: spacing.sm },
});
